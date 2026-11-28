import type { AvailableCommand, SessionConfigOption, SessionNotification } from '@agentclientprotocol/sdk'
import type { PreviewTarget } from '@shared/preview'
import type { AgentStatus, Attachment, ChatFolder, McpState, ModelSwitch, OpenedSession, PermissionPrompt, QuotaSnapshot, SessionSummary, Settings, VpnStatus, WorkspaceKind } from '@shared/api'
import type { PermissionLevel } from '@shared/permissions'
import { previewForCompletedCall, previewForReply, type AutoPreview } from './autoPreview'
import { switchingChange } from '@shared/modelFallback'
import { titleFrom, titleSource } from '@shared/titles'
import { modelName } from './models'
import { addError, addNote, addUserMessage, applyUpdate, type ThreadItem } from './thread'

export interface Thread extends OpenedSession {
  items: ThreadItem[]
  running: boolean
  /** Estimated tokens in the context window after the last turn (null until known). */
  contextTokens: number | null
  /** True while a saved conversation's history is being replayed: nothing in it may pop a preview open. */
  replaying: boolean
  /** Local servers already offered for preview, so each is only opened once per conversation. */
  seenUrls: string[]
}

export interface AppState {
  status: AgentStatus
  sessions: SessionSummary[]
  /** Folders the user made to file conversations in. */
  folders: ChatFolder[]
  threads: Record<string, Thread>
  activeId: string | null
  mode: WorkspaceKind
  folder: string | null
  permissions: PermissionPrompt[]
  /** The level a new chat starts with, chosen on the home screen before the chat exists. */
  newChatPermission: PermissionLevel
  /** The model list, set on the default model: what new chats start on (each chat may choose its own, see Thread.model). */
  model: Extract<SessionConfigOption, { type: 'select' }> | null
  /** A model chosen on the home screen for the chat about to start; null is the default. */
  newChatModel: string | null
  /** Slash commands are the same for every session, so they're app-wide too. */
  commands: AvailableCommand[]
  settings: Settings | null
  preview: PreviewTarget | null
  /** Bumped whenever a preview is (re)shown, so re-showing an edited file reloads it. */
  previewRevision: number
  /** A local server the agent mentioned: the hook waits for it to answer, then shows it. */
  pendingUrl: string | null
  /** Tokens used this month per model, and each model's context window size. */
  /** Real quota: undefined until first read, null when it cannot be read. */
  quota: QuotaSnapshot | null | undefined
  modelContexts: Record<string, number>
  /** Set when the model list could not be fetched, so the UI can offer a retry. */
  modelError: boolean
  view: 'conversation' | 'settings' | 'agents' | 'mcp'
  /** Text to start a new conversation's message with (e.g. "Ask for this agent"); `id` tells repeats apart. */
  draft: { text: string; id: number } | null
  /** The user's MCP servers and marketplace sign-in; null until read. */
  mcp: McpState | null
  /** Off the VPN, Code Puppy cannot reach its servers and turns just hang. */
  vpn: VpnStatus
  /** A newer Puppy is waiting (checked in the background). */
  updateAvailable: boolean
  /** Errors with no thread to live in (e.g. a session that failed to start). */
  notice: string | null
}

export type Action =
  | { type: 'status'; status: AgentStatus }
  | { type: 'sessions'; sessions: SessionSummary[] }
  | { type: 'folders'; folders: ChatFolder[] }
  | { type: 'opened'; session: OpenedSession; contextTokens?: number | null; replaying?: boolean }
  | { type: 'replayed'; sessionId: string }
  | { type: 'activate'; sessionId: string | null }
  | { type: 'mode'; mode: WorkspaceKind }
  | { type: 'folder'; folder: string }
  | { type: 'update'; notification: SessionNotification }
  | { type: 'sent'; sessionId: string; text: string; attachments: Attachment[]; /** When it was sent (ISO), for the sidebar row. */ at: string }
  | { type: 'finished'; sessionId: string; error?: string; contextTokens?: number | null }
  | { type: 'config'; configOptions: SessionConfigOption[] }
  | { type: 'modelSwitched'; change: ModelSwitch }
  | { type: 'permissionLevel'; sessionId: string; level: PermissionLevel }
  | { type: 'newChatPermission'; level: PermissionLevel }
  /** A chat's own model (null: the default). `byUser`: the user chose it just now, rather than a reopened chat getting it back. */
  | { type: 'chatModel'; sessionId: string; model: string | null; byUser: boolean }
  | { type: 'newChatModel'; model: string | null }
  | { type: 'settings'; settings: Settings }
  | { type: 'preview'; target: PreviewTarget | null }
  | { type: 'pendingUrlHandled' }
  | { type: 'quota'; quota: QuotaSnapshot | null }
  | { type: 'vpn'; status: VpnStatus }
  | { type: 'updateAvailable'; available: boolean }
  | { type: 'modelContexts'; contexts: Record<string, number> }
  | { type: 'modelError'; failed: boolean }
  | { type: 'view'; view: AppState['view'] }
  /** Start a new chat with this text already in the box. */
  | { type: 'ask'; text: string }
  | { type: 'mcp'; state: McpState }
  | { type: 'removed'; sessionId: string }
  | { type: 'permission'; prompt: PermissionPrompt }
  | { type: 'permissionAnswered'; requestId: string }
  | { type: 'notice'; message: string | null }

export const initialState: AppState = {
  status: { state: 'starting' },
  sessions: [],
  folders: [],
  threads: {},
  activeId: null,
  mode: 'chat',
  folder: null,
  permissions: [],
  newChatPermission: 'standard',
  model: null,
  newChatModel: null,
  commands: [],
  settings: null,
  preview: null,
  previewRevision: 0,
  pendingUrl: null,
  quota: undefined,
  modelContexts: {},
  modelError: false,
  view: 'conversation',
  draft: null,
  mcp: null,
  vpn: 'unknown',
  updateAvailable: false,
  notice: null,
}

/** The model shown for the open chat (its own, or the default), or for the chat about to start. */
export function shownModel(state: AppState): string | null {
  const thread = state.activeId ? state.threads[state.activeId] : undefined
  return (thread ? thread.model : state.newChatModel) ?? (state.model?.currentValue as string | undefined) ?? null
}

/** Said in a chat whose new model turns automatic switching off (or back on) for it. */
function switchingNote(state: AppState, thread: Thread, chosen: string | null): string | null {
  const fallback = state.settings?.modelFallback
  const defaultModel = (state.model?.currentValue as string | undefined) ?? null
  const after = chosen ?? defaultModel
  const change = fallback ? switchingChange(fallback, thread.model ?? defaultModel, after) : null
  if (change === 'off' && fallback?.main && after) {
    return `Automatic model switching is off in this chat while it uses ${modelName(state.model, after)}: it only switches from ${modelName(state.model, fallback.main)}.`
  }
  return change === 'on' ? 'Automatic model switching is back on in this chat.' : null
}

export function modelOption(options: SessionConfigOption[]): AppState['model'] {
  const found = options.find((option) => option.category === 'model' || option.id === 'model')
  return found?.type === 'select' ? found : null
}

function patchThread(state: AppState, sessionId: string, patch: (thread: Thread) => Partial<Thread>): AppState {
  const thread = state.threads[sessionId]
  if (!thread) return state
  return { ...state, threads: { ...state.threads, [sessionId]: { ...thread, ...patch(thread) } } }
}

function showPreview(state: AppState, target: PreviewTarget | null): AppState {
  return { ...state, preview: target, previewRevision: state.previewRevision + 1 }
}

/** Only the conversation on screen, live (not a history replay), and only if the user wants it. */
function mayAutoPreview(state: AppState, thread: Thread | undefined): thread is Thread {
  return !!thread && state.settings?.autoPreview === true && state.activeId === thread.sessionId && state.view === 'conversation' && !thread.replaying
}

/** Show a written file now; queue a mentioned server (once) for the hook to open when it answers. */
function applyAutoPreview(state: AppState, sessionId: string, found: AutoPreview): AppState {
  const thread = state.threads[sessionId]
  if (!thread) return state
  const fresh = found.urls.filter((url) => !thread.seenUrls.includes(url))
  let next = found.file ? showPreview(state, found.file) : state
  if (fresh.length) {
    next = patchThread({ ...next, pendingUrl: fresh[0] }, sessionId, () => ({ seenUrls: [...thread.seenUrls, ...fresh] }))
  }
  return next
}

function findCall(thread: Thread | undefined, toolCallId: string) {
  const item = thread?.items.find((candidate) => candidate.type === 'tool' && candidate.call.toolCallId === toolCallId)
  return item?.type === 'tool' ? item.call : undefined
}

/** A tool call that just completed may have produced something worth showing. */
function autoPreviewAfterUpdate(before: AppState, after: AppState, notification: SessionNotification): AppState {
  const { update, sessionId } = notification
  if (update.sessionUpdate !== 'tool_call' && update.sessionUpdate !== 'tool_call_update') return after
  const thread = after.threads[sessionId]
  if (!mayAutoPreview(after, thread)) return after
  const call = findCall(thread, update.toolCallId)
  if (call?.status !== 'completed' || findCall(before.threads[sessionId], update.toolCallId)?.status === 'completed') return after
  return applyAutoPreview(after, sessionId, previewForCompletedCall(call, thread.cwd))
}

/**
 * A new conversation's first message gives it a sidebar row right away, titled like the
 * main process will title it. Waiting for the reply would leave it missing for as long as
 * that takes, and forever if the reply never comes. The real list replaces this row later.
 */
function withRow(state: AppState, action: Extract<Action, { type: 'sent' }>): AppState {
  const thread = state.threads[action.sessionId]
  if (!thread || state.sessions.some((session) => session.sessionId === action.sessionId)) return state
  const row: SessionSummary = {
    sessionId: thread.sessionId,
    cwd: thread.cwd,
    kind: thread.kind,
    title: titleFrom(titleSource(action.text, action.attachments)) || null,
    updatedAt: action.at,
    contextTokens: null,
    pinned: false,
    folderId: null,
  }
  return { ...state, sessions: [row, ...state.sessions] }
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'status':
      return { ...state, status: action.status }
    case 'sessions': {
      // A conversation open on screen never loses its row, even when the list does not mention it (yet).
      const listed = new Set(action.sessions.map((session) => session.sessionId))
      const stillOpen = state.sessions.filter((session) => !listed.has(session.sessionId) && state.threads[session.sessionId])
      return { ...state, sessions: [...stillOpen, ...action.sessions] }
    }
    case 'folders':
      return { ...state, folders: action.folders }
    case 'opened': {
      const { session } = action
      const thread: Thread = {
        ...session,
        items: [],
        running: false,
        contextTokens: action.contextTokens ?? null,
        replaying: action.replaying ?? false,
        seenUrls: [],
      }
      return {
        ...state,
        threads: { ...state.threads, [session.sessionId]: thread },
        activeId: session.sessionId,
        view: 'conversation',
        draft: null, // it was sent (or the user went elsewhere): a later new chat starts empty
        newChatPermission: 'standard', // the choices were for that chat; the next one starts standard, on the default model
        newChatModel: null,
        preview: null,
        mode: session.kind,
        folder: session.kind === 'code' ? session.cwd : state.folder,
        model: state.model ?? modelOption(session.configOptions), // the list, should it not have arrived yet
      }
    }
    case 'activate': {
      const thread = action.sessionId ? state.threads[action.sessionId] : undefined
      return {
        ...state,
        activeId: action.sessionId,
        view: 'conversation',
        preview: null,
        mode: thread?.kind ?? state.mode,
        folder: thread?.kind === 'code' ? thread.cwd : state.folder,
      }
    }
    case 'mode':
      return { ...state, mode: action.mode, activeId: null, view: 'conversation', preview: null, draft: null }
    case 'folder':
      return { ...state, folder: action.folder, mode: 'code', activeId: null, view: 'conversation', preview: null }
    case 'update': {
      const { update } = action.notification
      if (update.sessionUpdate === 'available_commands_update') return { ...state, commands: update.availableCommands }
      const next = patchThread(state, action.notification.sessionId, (thread) => ({
        items: applyUpdate(thread.items, update),
      }))
      return autoPreviewAfterUpdate(state, next, action.notification)
    }
    case 'replayed':
      return patchThread(state, action.sessionId, () => ({ replaying: false }))
    case 'sent':
      return patchThread(withRow(state, action), action.sessionId, (thread) => ({
        items: addUserMessage(thread.items, action.text, action.attachments),
        running: true,
      }))
    case 'finished': {
      const next = patchThread(state, action.sessionId, (thread) => ({
        running: false,
        items: action.error ? addError(thread.items, action.error) : thread.items,
        contextTokens: action.contextTokens ?? thread.contextTokens,
      }))
      const thread = next.threads[action.sessionId]
      // The reply is complete now, so a server it mentions is worth showing.
      return !action.error && mayAutoPreview(next, thread) ? applyAutoPreview(next, action.sessionId, previewForReply(thread.items)) : next
    }
    case 'config':
      return { ...state, model: modelOption(action.configOptions) ?? state.model }
    case 'modelSwitched': {
      const { sessionId, from, to } = action.change
      const note = `${modelName(state.model, from)} has reached its usage limit, so Puppy switched this chat to ${modelName(state.model, to)} and carried on. New chats still start on ${modelName(state.model, from)}.`
      return patchThread(state, sessionId, (thread) => ({ model: to, items: addNote(thread.items, note) }))
    }
    case 'chatModel':
      return patchThread(state, action.sessionId, (thread) => {
        const note = action.byUser ? switchingNote(state, thread, action.model) : null
        return { model: action.model, items: note ? addNote(thread.items, note) : thread.items }
      })
    case 'newChatModel':
      return { ...state, newChatModel: action.model }
    case 'permissionLevel':
      return patchThread(state, action.sessionId, () => ({ permission: action.level }))
    case 'newChatPermission':
      return { ...state, newChatPermission: action.level }
    case 'settings':
      return { ...state, settings: action.settings }
    case 'preview':
      return showPreview(state, action.target)
    case 'pendingUrlHandled':
      return { ...state, pendingUrl: null }
    case 'quota':
      return { ...state, quota: action.quota }
    case 'vpn':
      return { ...state, vpn: action.status }
    case 'updateAvailable':
      return { ...state, updateAvailable: action.available }
    case 'modelContexts':
      return { ...state, modelContexts: action.contexts }
    case 'modelError':
      return { ...state, modelError: action.failed }
    case 'view':
      return { ...state, view: action.view }
    case 'ask':
      return { ...state, mode: 'chat', activeId: null, view: 'conversation', preview: null, draft: { text: action.text, id: (state.draft?.id ?? 0) + 1 } }
    case 'mcp':
      return { ...state, mcp: action.state }
    case 'removed': {
      const { [action.sessionId]: _gone, ...threads } = state.threads
      return {
        ...state,
        threads,
        sessions: state.sessions.filter((session) => session.sessionId !== action.sessionId),
        activeId: state.activeId === action.sessionId ? null : state.activeId,
      }
    }
    case 'permission':
      return { ...state, permissions: [...state.permissions, action.prompt] }
    case 'permissionAnswered':
      return { ...state, permissions: state.permissions.filter((p) => p.requestId !== action.requestId) }
    case 'notice':
      return { ...state, notice: action.message }
  }
}
