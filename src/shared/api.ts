/**
 * The contract between the Electron main process and the React UI.
 *
 * Main implements it (src/main/ipc.ts), preload exposes it as `window.puppy`
 * (src/preload/index.ts), and the renderer consumes it. Channel names live
 * here too, so the three layers can never drift apart.
 */
import type { PreviewTarget } from './preview'
import type {
  PermissionOption,
  StopReason,
  SessionConfigOption,
  SessionNotification,
} from '@agentclientprotocol/sdk'

export type WorkspaceKind = 'chat' | 'code'

export const THEMES = ['system', 'light', 'dark'] as const
export type ThemePreference = (typeof THEMES)[number]

export interface Settings {
  theme: ThemePreference
  /** Used in the home greeting; empty means "no name". */
  displayName: string
  /** Ask the model for a short title after the first reply (costs one small turn). */
  smartTitles: boolean
  /** Show pages Code Puppy writes, and local servers it starts, in the side panel on their own. */
  autoPreview: boolean
}

/** One quota bucket: tokens (or requests) used out of the limit for the current period. */
export interface QuotaBucket {
  used: number
  limit: number
}

/**
 * The user's real quota, as served by their Code Puppy backend (the same numbers
 * Code Puppy's /usage shows). Quota is per CLASS of model, not per model:
 * `standard` covers every model, `large` is carved out of it for the big ones.
 */
export interface QuotaSnapshot {
  /** When we read it (ms since epoch); `resetsInSecs` counts down from here. */
  fetchedAt: number
  standard: QuotaBucket
  large: QuotaBucket
  requests: QuotaBucket
  resetsInSecs: number
  /** How fast each model draws on the quota: 0 is free, 1 is the most expensive tier. */
  burnRates: Record<string, number>
}

export interface TurnResult {
  stopReason: StopReason
  /** Estimated tokens now in the conversation's context window (null if unknown). */
  contextTokens: number | null
}

export interface AppInfo {
  version: string
  dataPath: string
  logPath: string
}

/** A file sent along with a message. Read in the renderer with browser APIs only. */
export type Attachment =
  | { kind: 'image'; name: string; mimeType: string; data: string /* base64 */ }
  | { kind: 'text'; name: string; mimeType: string; text: string }

export type AgentStatus =
  | { state: 'starting' }
  | { state: 'ready' }
  | { state: 'error'; message: string }

export interface SessionSummary {
  sessionId: string
  cwd: string
  kind: WorkspaceKind
  title: string | null
  updatedAt: string | null
  contextTokens: number | null
}

/** What the UI needs after `session/new` or `session/load`. */
export interface OpenedSession {
  sessionId: string
  cwd: string
  kind: WorkspaceKind
  configOptions: SessionConfigOption[]
}

export interface PermissionPrompt {
  requestId: string
  sessionId: string
  title: string
  options: PermissionOption[]
}

export type Unsubscribe = () => void

export interface PuppyApi {
  getStatus(): Promise<AgentStatus>
  restartAgent(): Promise<void>
  getAppInfo(): Promise<AppInfo>
  revealLog(): Promise<void>
  getSettings(): Promise<Settings>
  updateSettings(patch: Partial<Settings>): Promise<Settings>
  listSessions(): Promise<SessionSummary[]>
  newSession(kind: WorkspaceKind, cwd?: string): Promise<OpenedSession>
  loadSession(sessionId: string, cwd: string): Promise<OpenedSession>
  renameSession(sessionId: string, title: string): Promise<void>
  deleteSession(sessionId: string): Promise<void>
  prompt(sessionId: string, text: string, attachments?: Attachment[]): Promise<TurnResult>
  cancel(sessionId: string): Promise<void>
  /** Code Puppy's model list, available before any conversation exists. */
  getConfigOptions(): Promise<SessionConfigOption[]>
  /** The model is global; passing the active session also rebinds it live. */
  setModel(value: string, sessionId?: string): Promise<SessionConfigOption[]>
  answerPermission(requestId: string, optionId: string | null): Promise<void>
  chooseFolder(): Promise<string | null>
  /** Save model-written HTML as a file inside the app's data folder and return a preview of it. */
  previewHtml(html: string): Promise<PreviewTarget>
  /** Open a preview file, or a localhost URL, in the user's browser. */
  openInBrowser(target: string): Promise<void>
  /** Resolves true once a localhost server answers (polls for a while), false if it never does. */
  waitForServer(url: string): Promise<boolean>
  /** Latest quota (cached; null if it cannot be read, e.g. when offline). */
  getQuota(): Promise<QuotaSnapshot | null>
  /** Read it again now (rate-limited), e.g. when the model menu opens. */
  refreshQuota(): Promise<QuotaSnapshot | null>
  /** Context window size (tokens) for each model Code Puppy knows. */
  getModelContexts(): Promise<Record<string, number>>
  onStatus(listener: (status: AgentStatus) => void): Unsubscribe
  onSessionUpdate(listener: (notification: SessionNotification) => void): Unsubscribe
  onPermissionRequest(listener: (prompt: PermissionPrompt) => void): Unsubscribe
  onSessionsChanged(listener: () => void): Unsubscribe
  onQuota(listener: (quota: QuotaSnapshot | null) => void): Unsubscribe
  /** Start Code Puppy for a project folder ahead of the first message, so that message is not slow. */
  prepareFolder(path: string): Promise<void>
}

/** Request/response channels (ipcRenderer.invoke ⇄ ipcMain.handle). */
export const Invoke = {
  getStatus: 'agent:get-status',
  restartAgent: 'agent:restart',
  getAppInfo: 'app:info',
  revealLog: 'app:reveal-log',
  getSettings: 'settings:get',
  updateSettings: 'settings:update',
  listSessions: 'session:list',
  newSession: 'session:new',
  loadSession: 'session:load',
  renameSession: 'session:rename',
  deleteSession: 'session:delete',
  prompt: 'session:prompt',
  cancel: 'session:cancel',
  getConfigOptions: 'model:options',
  setModel: 'model:set',
  answerPermission: 'permission:answer',
  chooseFolder: 'dialog:choose-folder',
  previewHtml: 'preview:html',
  openInBrowser: 'preview:open-external',
  waitForServer: 'preview:wait-for-server',
  getQuota: 'quota:get',
  refreshQuota: 'quota:refresh',
  prepareFolder: 'folder:prepare',
  getModelContexts: 'model:contexts',
} as const satisfies Partial<Record<keyof PuppyApi, string>>

/** Push channels (main → renderer via webContents.send). */
export const Push = {
  status: 'agent:status',
  sessionUpdate: 'session:update',
  permissionRequest: 'permission:request',
  sessionsChanged: 'session:list-changed',
  quota: 'quota:changed',
} as const
