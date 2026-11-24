import type { AvailableCommand, SessionConfigOption, SessionNotification } from '@agentclientprotocol/sdk'
import type { PreviewTarget } from '@shared/preview'
import type { AgentStatus, Attachment, ChatFolder, OpenedSession, PermissionPrompt, QuotaSnapshot, SessionSummary, Settings, WorkspaceKind } from '@shared/api'
import { previewForCompletedCall, previewForReply, type AutoPreview } from './autoPreview'
import { addError, addUserMessage, applyUpdate, type ThreadItem } from './thread'

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
  /** Code Puppy's model is global, so the picker is app-wide, not per thread. */
  model: Extract<SessionConfigOption, { type: 'select' }> | null
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
  view: 'conversation' | 'settings'
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
  | { type: 'sent'; sessionId: string; text: string; attachments: Attachment[] }
  | { type: 'finished'; sessionId: string; error?: string; contextTokens?: number | null }
  | { type: 'config'; configOptions: SessionConfigOption[] }
  | { type: 'settings'; settings: Settings }
  | { type: 'preview'; target: PreviewTarget | null }
  | { type: 'pendingUrlHandled' }
  | { type: 'quota'; quota: QuotaSnapshot | null }
  | { type: 'modelContexts'; contexts: Record<string, number> }
  | { type: 'modelError'; failed: boolean }
  | { type: 'view'; view: AppState['view'] }
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
  model: null,
  commands: [],
  settings: null,
  preview: null,
  previewRevision: 0,
  pendingUrl: null,
  quota: undefined,
  modelContexts: {},
  modelError: false,
  view: 'conversation',
  notice: null,
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

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'status':
      return { ...state, status: action.status }
    case 'sessions':
      return { ...state, sessions: action.sessions }
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
        preview: null,
        mode: session.kind,
        folder: session.kind === 'code' ? session.cwd : state.folder,
        model: modelOption(session.configOptions) ?? state.model,
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
      return { ...state, mode: action.mode, activeId: null, view: 'conversation', preview: null }
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
      return patchThread(state, action.sessionId, (thread) => ({
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
    case 'settings':
      return { ...state, settings: action.settings }
    case 'preview':
      return showPreview(state, action.target)
    case 'pendingUrlHandled':
      return { ...state, pendingUrl: null }
    case 'quota':
      return { ...state, quota: action.quota }
    case 'modelContexts':
      return { ...state, modelContexts: action.contexts }
    case 'modelError':
      return { ...state, modelError: action.failed }
    case 'view':
      return { ...state, view: action.view }
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
