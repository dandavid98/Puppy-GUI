import { EventEmitter } from 'node:events'
import { mkdirSync, statSync } from 'node:fs'
import type { ContentBlock, NewSessionResponse, PromptResponse, SessionConfigOption, SessionInfo, SessionNotification } from '@agentclientprotocol/sdk'
import type { Attachment, OpenedSession, SessionSummary, TurnResult, WorkspaceKind } from '@shared/api'
import { DEFAULT_CONTEXT_LENGTH } from '@shared/limits'
import { cleanTitle, titleFrom, titlePrompt, titleSource } from '@shared/titles'
import { estimateContext, readTurnUsage } from './context'
import type { AgentPool } from './acp/agentPool'
import { deletePersistedSession } from './acp/sessionStore'
import { promptBlocks } from './promptBlocks'
import type { SessionIndex, SessionMeta } from './sessionIndex'
import type { SettingsStore } from './settings'

const MODEL_OPTION = 'model'

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** Merge what ACP knows (id, cwd) with what we know (kind, title, recency, pin, folder). */
export function summarize(info: SessionInfo, meta: SessionMeta): SessionSummary {
  return {
    sessionId: info.sessionId,
    cwd: info.cwd,
    kind: meta.kind,
    title: meta.title,
    updatedAt: meta.updatedAt,
    contextTokens: meta.contextTokens ?? null,
    pinned: meta.pinned ?? false,
    folderId: meta.folderId ?? null,
  }
}

export function newestFirst(a: SessionSummary, b: SessionSummary): number {
  return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
}

/**
 * The app's view of conversations. "Chat" and "Code" are both plain ACP
 * sessions; the only difference is the folder: chats run in a private
 * scratch directory, code sessions in the project folder the user picked.
 *
 * Each session is served by the Code Puppy process started in its folder
 * (see AgentPool); chats and throwaway sessions use the home process.
 *
 * Emits `changed` when the session list changes behind the UI's back (e.g. a
 * smart title arrived), and `turn` whenever a model turn finished (the
 * user's quota has moved).
 */
export class Workspace extends EventEmitter<{ changed: []; turn: [] }> {
  /** Folders this app has worked in this run: the only places previews may read from. */
  readonly roots = new Set<string>()

  constructor(
    private readonly agents: AgentPool,
    private readonly index: SessionIndex,
    private readonly settings: SettingsStore,
    private readonly chatDir: string,
    private readonly contextLengths: () => Record<string, number>,
  ) {
    super()
  }

  /** The model code-puppy last told us it is using; sizes the context window. */
  private currentModel: string | null = null
  /** Which folder (so which process) each open session lives in. */
  private readonly sessionFolders = new Map<string, string>()

  private contextIn(folder: string) {
    return this.agents.forFolder(folder).context()
  }

  /** Unknown sessions fall back to the home process, which will answer "no such session" itself. */
  private contextFor(sessionId: string) {
    return this.contextIn(this.sessionFolders.get(sessionId) ?? this.chatDir)
  }

  /** Start Code Puppy for a folder now, so the first message does not wait for it to boot. */
  prepare(folder: string): void {
    if (isDirectory(folder)) void this.contextIn(folder).catch(() => undefined)
  }

  /**
   * Only sessions this app created. Code Puppy stores every ACP session in one
   * shared place, so editors, scripts and test runs would otherwise leak in.
   */
  async list(): Promise<SessionSummary[]> {
    const context = await this.agents.home.context() // the store is shared, so any process can list it
    const { sessions } = await context.request('session/list', {})
    return sessions
      .flatMap((info) => {
        const meta = this.index.get(info.sessionId)
        return meta ? [summarize(info, meta)] : []
      })
      .sort(newestFirst)
  }

  async create(kind: WorkspaceKind, folder?: string): Promise<OpenedSession> {
    const cwd = kind === 'chat' ? this.chatDir : folder
    if (!cwd) throw new Error('Pick a project folder before starting a code session.')
    if (kind === 'code' && !isDirectory(cwd)) throw new Error(`That folder no longer exists: ${cwd}`)
    const response = await this.newSession(cwd)
    this.roots.add(cwd)
    this.rememberModel(response.configOptions)
    this.index.create(response.sessionId, kind)
    return { sessionId: response.sessionId, cwd, kind, configOptions: response.configOptions ?? [] }
  }

  /** Re-opens a saved session; Code Puppy replays its history as session/update notifications. */
  async load(sessionId: string, cwd: string): Promise<OpenedSession> {
    if (!isDirectory(cwd)) throw new Error(`That folder no longer exists: ${cwd}`)
    const context = await this.contextIn(cwd)
    const response = await context.request('session/load', { sessionId, cwd, mcpServers: [] })
    this.sessionFolders.set(sessionId, cwd)
    this.roots.add(cwd)
    this.rememberModel(response.configOptions)
    const kind = this.index.get(sessionId)?.kind ?? 'code'
    return { sessionId, cwd, kind, configOptions: response.configOptions ?? [] }
  }

  rename(sessionId: string, title: string): void {
    const clean = title.trim()
    if (clean) this.index.update(sessionId, { title: clean, customTitle: true })
  }

  async remove(sessionId: string): Promise<void> {
    await this.close(sessionId)
    this.index.remove(sessionId)
  }

  async prompt(sessionId: string, text: string, attachments: Attachment[] = []): Promise<TurnResult> {
    const meta = this.index.get(sessionId)
    const firstTurn = meta !== undefined && meta.title === null
    const source = titleSource(text, attachments)
    this.index.update(sessionId, { updatedAt: new Date().toISOString(), title: meta?.title ?? titleFrom(source) })

    const { response, toolCalls } = await this.runPrompt(sessionId, promptBlocks(text, attachments))
    if (firstTurn && response.stopReason === 'end_turn') void this.smartTitle(sessionId, source)

    const previous = meta?.contextTokens ?? null
    const usage = readTurnUsage(response)
    const contextTokens = usage
      ? estimateContext({ previous, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, toolCalls, contextLength: this.contextLength() })
      : previous
    if (contextTokens !== null) this.index.update(sessionId, { contextTokens })
    return { stopReason: response.stopReason, contextTokens }
  }

  /** Window size of the current model, from code-puppy's model files. */
  private contextLength(): number {
    return (this.currentModel ? this.contextLengths()[this.currentModel] : undefined) ?? DEFAULT_CONTEXT_LENGTH
  }

  private rememberModel(options: SessionConfigOption[] | null | undefined): void {
    const model = options?.find((option) => option.id === MODEL_OPTION)
    if (model && typeof model.currentValue === 'string') this.currentModel = model.currentValue
  }

  /** One prompt turn, with its tool calls counted (each one costs a model request). */
  private async runPrompt(sessionId: string, prompt: ContentBlock[]): Promise<{ response: PromptResponse; toolCalls: number }> {
    const toolCallIds = new Set<string>()
    const count = ({ sessionId: from, update }: SessionNotification) => {
      if (from === sessionId && update.sessionUpdate === 'tool_call') toolCallIds.add(update.toolCallId)
    }
    this.agents.on('sessionUpdate', count)
    try {
      const context = await this.contextFor(sessionId)
      const response = await context.request('session/prompt', { sessionId, prompt })
      return { response, toolCalls: toolCallIds.size }
    } finally {
      this.agents.off('sessionUpdate', count)
      this.emit('turn')
    }
  }

  async cancel(sessionId: string): Promise<void> {
    this.agents.cancelPermissions(sessionId)
    const context = await this.contextFor(sessionId)
    await context.notify('session/cancel', { sessionId })
  }

  /** The model list, even before any conversation exists. */
  async configOptions(): Promise<SessionConfigOption[]> {
    return this.withScratchSession(async (_sessionId, response) => {
      this.rememberModel(response.configOptions)
      return response.configOptions ?? []
    })
  }

  /** The model is a global Code Puppy setting; a live session is also rebound to it. */
  async setModel(value: string, sessionId?: string): Promise<SessionConfigOption[]> {
    const apply = async (target: string) => {
      const context = await this.contextFor(target)
      const response = await context.request('session/set_config_option', { sessionId: target, configId: MODEL_OPTION, value })
      this.rememberModel(response.configOptions)
      return response.configOptions
    }
    return sessionId ? apply(sessionId) : this.withScratchSession(apply)
  }

  /** A throwaway session in the chat folder, always closed (and so deleted) afterwards. */
  private async withScratchSession<T>(use: (sessionId: string, response: NewSessionResponse) => Promise<T>): Promise<T> {
    const response = await this.newSession(this.chatDir)
    try {
      return await use(response.sessionId, response)
    } finally {
      await this.close(response.sessionId)
    }
  }

  /**
   * Delete a session and its saved history. Prefers code-puppy's own
   * session/close; falls back to removing its files (see sessionStore.ts).
   */
  private async close(sessionId: string): Promise<void> {
    try {
      const context = await this.contextFor(sessionId)
      await context.request('session/close', { sessionId })
    } catch {
      deletePersistedSession(sessionId)
    }
    this.sessionFolders.delete(sessionId)
  }

  private async newSession(cwd: string): Promise<NewSessionResponse> {
    mkdirSync(cwd, { recursive: true })
    const context = await this.contextIn(cwd)
    const response = await context.request('session/new', { cwd, mcpServers: [] })
    this.sessionFolders.set(response.sessionId, cwd)
    return response
  }

  /** Best effort: on any failure the first-message title simply stays. */
  private async smartTitle(sessionId: string, firstMessage: string): Promise<void> {
    if (!this.settings.get().smartTitles) return
    try {
      const reply = await this.withScratchSession(async (scratchId) => {
        let text = ''
        const collect = ({ sessionId: from, update }: SessionNotification) => {
          if (from === scratchId && update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') {
            text += update.content.text
          }
        }
        this.agents.on('sessionUpdate', collect)
        try {
          await this.runPrompt(scratchId, [{ type: 'text', text: titlePrompt(firstMessage) }])
        } finally {
          this.agents.off('sessionUpdate', collect)
        }
        return text
      })
      const title = cleanTitle(reply)
      if (title && !this.index.get(sessionId)?.customTitle && this.index.update(sessionId, { title })) this.emit('changed')
    } catch {
      // Keep the fallback title.
    }
  }
}
