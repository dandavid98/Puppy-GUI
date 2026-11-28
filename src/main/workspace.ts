import { EventEmitter } from 'node:events'
import { mkdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ContentBlock, McpServer, NewSessionResponse, PromptResponse, SessionConfigOption, SessionInfo, SessionNotification } from '@agentclientprotocol/sdk'
import type { Attachment, ModelSwitch, OpenedSession, SessionSummary, TurnResult, WorkspaceKind } from '@shared/api'
import { DEFAULT_CONTEXT_LENGTH } from '@shared/limits'
import type { PermissionLevel } from '@shared/permissions'
import { cleanTitle, titleFrom, titlePrompt, titleSource } from '@shared/titles'
import { estimateContext, readTurnUsage } from './context'
import type { AgentPool } from './acp/agentPool'
import { ChatModels } from './chatModels'
import { confirmedLevel, PermissionLevels } from './acp/permissionLevels'
import { deletePersistedSession } from './acp/sessionStore'
import { RETRY_NOTE, type ModelFallback } from './modelFallback'
import { promptBlocks } from './promptBlocks'
import type { SessionIndex, SessionMeta } from './sessionIndex'
import type { SettingsStore } from './settings'

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
export class Workspace extends EventEmitter<{ changed: []; turn: []; modelSwitched: [ModelSwitch] }> {
  /** Folders this app has worked in this run: the only places previews may read from. */
  readonly roots = new Set<string>()

  constructor(
    private readonly agents: AgentPool,
    private readonly index: SessionIndex,
    private readonly settings: SettingsStore,
    private readonly chatDir: string,
    private readonly contextLengths: () => Record<string, number>,
    /** The user's MCP servers, for conversations (not for throwaway sessions such as titles). */
    private readonly mcpServers: () => Promise<McpServer[]> = async () => [],
    /** Each chat's permission level (the same one the agents consult when Code Puppy asks). */
    private readonly levels: PermissionLevels = new PermissionLevels(),
    /** What to do when a turn runs into the main model's usage limit; without it, such a turn simply fails. */
    private readonly fallback?: ModelFallback,
  ) {
    super()
    this.models = new ChatModels(
      async (sessionId, configId, value) => (await this.contextFor(sessionId)).request('session/set_config_option', { sessionId, configId, value }),
      (use) => this.inEveryProcess(use),
      index,
    )
  }

  /** The default model, and each chat's own. */
  private readonly models: ChatModels

  /** The model a chat runs on: its own if it chose one, else the default. */
  modelOf(sessionId: string): string | null {
    return this.models.of(sessionId)
  }
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
    const response = await this.newSession(cwd, await this.mcpServers())
    this.roots.add(cwd)
    this.index.create(response.sessionId, kind)
    // A new chat starts on the default: Code Puppy's model, which no chat's own choice ever moves.
    return { sessionId: response.sessionId, cwd, kind, permission: 'standard', model: null, configOptions: response.configOptions ?? [] }
  }

  /** Re-opens a saved session; Code Puppy replays its history as session/update notifications. */
  async load(sessionId: string, cwd: string): Promise<OpenedSession> {
    if (!isDirectory(cwd)) throw new Error(`That folder no longer exists: ${cwd}`)
    const context = await this.contextIn(cwd)
    const response = await context.request('session/load', { sessionId, cwd, mcpServers: await this.mcpServers() })
    this.sessionFolders.set(sessionId, cwd)
    this.roots.add(cwd)
    const kind = this.index.get(sessionId)?.kind ?? 'code'
    const permission = await this.restorePermission(sessionId)
    return { sessionId, cwd, kind, permission, model: await this.models.restore(sessionId), configOptions: response.configOptions ?? [] }
  }

  /**
   * Changes how much Code Puppy may do in a chat without asking. Takes effect at once, even in a
   * turn that is running. Anything but standard needs Code Puppy to say it applied the level (a
   * Code Puppy that silently ignored it would make "ask every time" a promise nobody keeps), so
   * if it cannot, this throws and the chat stays as it was.
   */
  async setPermissionLevel(sessionId: string, level: PermissionLevel): Promise<PermissionLevel> {
    const context = await this.contextFor(sessionId)
    const response = await context.request('session/set_mode', { sessionId, modeId: level })
    if (level !== 'standard' && confirmedLevel(response) !== level) {
      throw new Error("This version of Code Puppy can't change permission levels, so the chat stays on Standard.")
    }
    this.levels.set(sessionId, level)
    this.index.update(sessionId, { permission: level })
    return level
  }

  /** A reopened chat gets its level back. If Code Puppy cannot, it is standard, and says so. */
  private async restorePermission(sessionId: string): Promise<PermissionLevel> {
    const saved = this.index.get(sessionId)?.permission
    if (!saved || saved === 'standard') return 'standard'
    try {
      return await this.setPermissionLevel(sessionId, saved)
    } catch {
      this.levels.set(sessionId, 'standard')
      this.index.update(sessionId, { permission: 'standard' })
      return 'standard'
    }
  }

  rename(sessionId: string, title: string): void {
    const clean = title.trim()
    if (clean) this.index.update(sessionId, { title: clean, customTitle: true })
  }

  async remove(sessionId: string): Promise<void> {
    await this.close(sessionId)
    this.levels.forget(sessionId)
    this.models.forget(sessionId)
    this.fallback?.forget(sessionId)
    this.index.remove(sessionId)
  }

  async prompt(sessionId: string, text: string, attachments: Attachment[] = []): Promise<TurnResult> {
    const meta = this.index.get(sessionId)
    const firstTurn = meta !== undefined && meta.title === null
    const source = titleSource(text, attachments)
    this.index.update(sessionId, { updatedAt: new Date().toISOString(), title: meta?.title ?? titleFrom(source) })

    const { response, toolCalls } = await this.runWithFallback(sessionId, promptBlocks(text, attachments))
    if (firstTurn && response.stopReason === 'end_turn') void this.smartTitle(sessionId, source)

    const previous = meta?.contextTokens ?? null
    const usage = readTurnUsage(response)
    const contextTokens = usage
      ? estimateContext({ previous, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, toolCalls, contextLength: this.contextLength(sessionId) })
      : previous
    if (contextTokens !== null) this.index.update(sessionId, { contextTokens })
    return { stopReason: response.stopReason, contextTokens }
  }

  /** Window size of the chat's model, from code-puppy's model files. */
  private contextLength(sessionId: string): number {
    const model = this.modelOf(sessionId)
    return (model ? this.contextLengths()[model] : undefined) ?? DEFAULT_CONTEXT_LENGTH
  }

  /**
   * One turn. If it stopped on the main model's usage limit and the user chose a fallback, it is the same
   * turn again on the secondary model; if the switch cannot be made, the user gets the error as usual.
   */
  private async runWithFallback(sessionId: string, blocks: ContentBlock[]): Promise<{ response: PromptResponse; toolCalls: number }> {
    const first = await this.runPrompt(sessionId, blocks)
    const handover = this.fallback?.take(sessionId)
    if (!handover) return first
    const { plan, giveBack } = handover
    try {
      await this.models.choose(sessionId, plan.to, { keep: false })
    } catch {
      /* handled below: what matters is whether the model really changed */
    }
    if (this.modelOf(sessionId) !== plan.to) {
      giveBack()
      return first
    }
    this.emit('modelSwitched', { sessionId, from: plan.from, to: plan.to })
    return this.runPrompt(sessionId, first.toolCalls > 0 ? [...blocks, { type: 'text', text: RETRY_NOTE }] : blocks)
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
      this.models.remember(response.configOptions)
      return response.configOptions ?? []
    })
  }

  /** With a chat: that chat's own model, nothing else moves. Without: the default, for new chats and chats that never chose. */
  async setModel(value: string, sessionId?: string): Promise<SessionConfigOption[]> {
    return sessionId ? this.models.choose(sessionId, value) : this.models.setDefault(value)
  }

  /**
   * Once in every running Code Puppy (the home one first, and it must work); a project's that fails is left
   * as it is, since the one thing done here, setting the default model, is read again when it restarts.
   */
  private async inEveryProcess<T>(use: (scratchId: string) => Promise<T>): Promise<T[]> {
    const results = [await this.withScratchSession(use)]
    for (const folder of this.agents.folders().filter((folder) => resolve(folder) !== resolve(this.chatDir))) {
      try {
        results.push(await this.withScratchSession(use, folder))
      } catch {
        /* see above */
      }
    }
    return results
  }

  /** A throwaway session (in the chat folder unless told otherwise), always closed (and so deleted) afterwards. */
  private async withScratchSession<T>(use: (sessionId: string, response: NewSessionResponse) => Promise<T>, folder = this.chatDir): Promise<T> {
    const response = await this.newSession(folder)
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

  private async newSession(cwd: string, mcpServers: McpServer[] = []): Promise<NewSessionResponse> {
    mkdirSync(cwd, { recursive: true })
    const context = await this.contextIn(cwd)
    const response = await context.request('session/new', { cwd, mcpServers })
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
