/**
 * The contract between the Electron main process and the React UI.
 *
 * Main implements it (src/main/ipc.ts), preload exposes it as `window.puppy`
 * (src/preload/index.ts), and the renderer consumes it. Channel names live
 * here too, so the three layers can never drift apart.
 */
import type { PermissionLevel } from './permissions'
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
  /** Show Code Puppy's work as it happens, like the terminal does: thoughts, reasoning and every tool call, opened up. */
  thinkingMode: boolean
  /** The agent new chats in Puppy use (null: Code Puppy's own default). Never changes the terminal's. */
  defaultAgent: string | null
  /** What to do when the main model hits its usage limit in the middle of a turn. */
  modelFallback: ModelFallbackSettings
}

/**
 * Off until the user turns it on. When the main model runs out of quota during a turn,
 * Puppy switches to the secondary one and carries on. Both are model names from Code
 * Puppy's list; the feature does nothing until both are chosen, and they differ.
 */
export interface ModelFallbackSettings {
  enabled: boolean
  main: string | null
  secondary: string | null
}

/** A turn that ran into a usage limit, and what Puppy did about it. */
export interface ModelSwitch {
  sessionId: string
  from: string
  /** Now this chat's own model (for the rest of this run of the chat: reopened, it is back on the default). */
  to: string
}

/** One of Code Puppy's agents. */
export interface AgentInfo {
  name: string
  displayName: string
  description: string
  /** Made by the user (or downloaded from the agent marketplace), not built in. */
  custom: boolean
}

export interface AgentList {
  agents: AgentInfo[]
  /** The agent new chats use. */
  current: string
}

/** A server listed in Walmart's MCP marketplace. */
export interface McpListing {
  id: string
  displayName: string
  description: string
  tags: string[]
  author: string
  verified: boolean
}

/** A server the user added. Puppy only: Code Puppy in the terminal never sees it. */
export interface McpServerInfo {
  id: string
  displayName: string
  enabled: boolean
  source: McpSource
}

export type McpSource = 'marketplace' | 'catalog'

/** A catalog server's id among the user's servers, kept apart from marketplace ids. */
const CATALOG_PREFIX = 'catalog:'
export const catalogServerId = (catalogId: string): string => `${CATALOG_PREFIX}${catalogId}`
export const catalogIdOf = (serverId: string): string => (serverId.startsWith(CATALOG_PREFIX) ? serverId.slice(CATALOG_PREFIX.length) : serverId)

/** Something the user fills in when adding a catalog server: a setting (a database path) or a key (secret). */
export interface McpField {
  name: string
  label: string
  /** Used when left empty. */
  default: string
  required: boolean
  /** An API key or token: typed into a password box, kept encrypted, never shown again. */
  secret: boolean
}

/** A server in Code Puppy's own catalog. Ones whose package no longer exists are left out. */
export interface McpCatalogEntry {
  id: string
  displayName: string
  description: string
  category: string
  tags: string[]
  verified: boolean
  fields: McpField[]
  /** Why it cannot run on this Mac (e.g. "Needs docker"), or null. */
  unavailable: string | null
  /** Its authors no longer maintain it, though it still runs. */
  deprecated: boolean
}

export interface McpState {
  servers: McpServerInfo[]
  /** Signed in to the marketplace, which its servers need. Null until checked. */
  signedIn: boolean | null
}

/**
 * A credential Puppy (or an app of the user's) relies on, and whether it still
 * works. Never carries the token itself, only who it is for and when it ends.
 */
export interface ConnectionInfo {
  id: string
  name: string
  /** Built in (Walmart sign-in, GitHub key), or one the user added. Only the latter can be removed here. */
  removable: boolean
  /** `connected`: a token is there (and accepted, where it can be checked). `unknown`: it could not be checked right now. */
  state: 'connected' | 'disconnected' | 'unknown'
  /** Whose it is, for example an email address. */
  account: string | null
  /** Milliseconds since the epoch; null when it does not expire or the end is unknown. */
  expiresAt: number | null
  note: string | null
  /** How to get a new one. `signIn`: Puppy can start it (the Walmart sign-in). */
  renew: { steps: string; url: string | null; signIn: boolean } | null
}

/** A line of a token file, by name only: its value never leaves the main process. */
export interface ConnectionFileVariable {
  name: string
  /** A login token that says when it ends (a JWT with an expiry). */
  selfExpiring: boolean
}

/** A file Puppy found that looks like it holds a token, described the way a person would say it. */
export interface ConnectionFileSuggestion {
  file: string
  /** The file's own name, such as .env.local. */
  name: string
  /** The folder it is in: usually the project's name. */
  folder: string
  /** That folder's place, with the home folder as ~. */
  where: string
  modifiedMs: number
}

/** How an added connection's token ends. */
export type ConnectionExpiry = { kind: 'token' } | { kind: 'days'; days: number } | { kind: 'none' }

/** A token that lives in a file of `NAME=value` lines (a `.env` file). Puppy only reads it, and only to show whose it is and when it ends. */
export interface ConnectionDraft {
  name: string
  file: string
  tokenVariable: string
  accountVariable: string
  expiry: ConnectionExpiry
  renewUrl: string
  renewSteps: string
}

/** Whether Walmart's network (VPN or Eagle WiFi) is reachable. Code Puppy cannot work without it. */
export type VpnStatus = 'unknown' | 'connected' | 'disconnected'

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

/** What "Update Puppy" did. */
export type UpdateOutcome =
  | { state: 'started' } // Puppy is closing; a helper updates it and reopens it
  | { state: 'current' }
  | { state: 'declined' }
  | { state: 'unavailable'; reason: string }

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
  /** Pinned conversations stay at the top of wherever they live (their folder, or the sidebar). */
  pinned: boolean
  /** The user's folder this conversation was filed in, if any. */
  folderId: string | null
}

/** A folder the user made to file conversations in. Each belongs to one tab: chat folders hold chats, code folders hold code sessions. */
export interface ChatFolder {
  id: string
  name: string
  kind: WorkspaceKind
  pinned: boolean
  /** Shown closed in the sidebar. */
  collapsed: boolean
}

export type FolderPatch = Partial<Pick<ChatFolder, 'name' | 'pinned' | 'collapsed'>>

/** What the UI needs after `session/new` or `session/load`. */
export interface OpenedSession {
  /** How much Code Puppy may do in this chat without asking. */
  permission: PermissionLevel
  sessionId: string
  cwd: string
  kind: WorkspaceKind
  /** The model this chat chose for itself; null when it runs on the default. */
  model: string | null
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
  /** Pull, reinstall and repackage Puppy from its own source, then reopen it (asks first). */
  updateApp(): Promise<UpdateOutcome>
  /** Is a newer Puppy waiting? (Checked in the background.) */
  getUpdateAvailable(): Promise<boolean>
  getAppInfo(): Promise<AppInfo>
  revealLog(): Promise<void>
  getVpnStatus(): Promise<VpnStatus>
  /** Probe right now, e.g. from a "Check again" button. */
  checkVpn(): Promise<VpnStatus>
  getSettings(): Promise<Settings>
  updateSettings(patch: Partial<Settings>): Promise<Settings>
  listSessions(): Promise<SessionSummary[]>
  newSession(kind: WorkspaceKind, cwd?: string): Promise<OpenedSession>
  loadSession(sessionId: string, cwd: string): Promise<OpenedSession>
  /** Changes how much Code Puppy may do in a chat without asking. Rejects (and changes nothing) if Code Puppy cannot honor it. */
  setPermissionLevel(sessionId: string, level: PermissionLevel): Promise<PermissionLevel>
  renameSession(sessionId: string, title: string): Promise<void>
  deleteSession(sessionId: string): Promise<void>
  pinSession(sessionId: string, pinned: boolean): Promise<void>
  /** File a conversation in a folder (of its own tab), or take it out with null. */
  moveSession(sessionId: string, folderId: string | null): Promise<void>
  listFolders(): Promise<ChatFolder[]>
  createFolder(name: string, kind: WorkspaceKind): Promise<ChatFolder>
  updateFolder(id: string, patch: FolderPatch): Promise<void>
  /** Removes the folder only: its conversations are kept and go back to the main list. */
  deleteFolder(id: string): Promise<void>
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
  listAgents(): Promise<AgentList>
  /** The agent new chats use, in Puppy only. Restarts Code Puppy, so a reply in progress stops. */
  setDefaultAgent(name: string): Promise<AgentList>
  getMcpState(): Promise<McpState>
  listMcpMarketplace(): Promise<McpListing[]>
  /** Added servers join new chats (and reopened ones). */
  addMcpServer(id: string): Promise<McpState>
  removeMcpServer(id: string): Promise<McpState>
  setMcpServerEnabled(id: string, enabled: boolean): Promise<McpState>
  /** Walmart SSO for the marketplace: opens Chrome, which closes again by itself if already signed in. */
  signInToMcp(): Promise<McpState>
  listConnections(): Promise<ConnectionInfo[]>
  addConnection(draft: ConnectionDraft): Promise<ConnectionInfo[]>
  removeConnection(id: string): Promise<ConnectionInfo[]>
  /** A file picker that shows hidden files (a `.env.local`); null if cancelled. */
  chooseConnectionFile(): Promise<string | null>
  /** Token files Puppy found in the user's own folders, newest first. */
  findConnectionFiles(): Promise<ConnectionFileSuggestion[]>
  /** The names of the lines in a token file (never their values), or why it cannot be used. */
  inspectConnectionFile(file: string): Promise<ConnectionFileVariable[]>
  /** How the connection would look if added now, so the user sees it before saving; null while the form is incomplete. */
  previewConnection(draft: ConnectionDraft): Promise<ConnectionInfo | null>
  /** Opens the connection's renewal page in the browser. */
  openConnectionRenewal(id: string): Promise<void>
  listMcpCatalog(): Promise<McpCatalogEntry[]>
  /** Starts the server once to check it works (and to download it), then adds it. `values` go one way: never back to the window. */
  addMcpCatalogServer(id: string, values: Record<string, string>): Promise<McpState>
  onMcpState(listener: (state: McpState) => void): Unsubscribe
  onStatus(listener: (status: AgentStatus) => void): Unsubscribe
  onSessionUpdate(listener: (notification: SessionNotification) => void): Unsubscribe
  onPermissionRequest(listener: (prompt: PermissionPrompt) => void): Unsubscribe
  onSessionsChanged(listener: () => void): Unsubscribe
  onQuota(listener: (quota: QuotaSnapshot | null) => void): Unsubscribe
  onVpnStatus(listener: (status: VpnStatus) => void): Unsubscribe
  /** A turn hit the main model's usage limit and Puppy moved to the secondary model (see ModelFallbackSettings). */
  onModelSwitched(listener: (change: ModelSwitch) => void): Unsubscribe
  onUpdateAvailable(listener: (available: boolean) => void): Unsubscribe
  /** Start Code Puppy for a project folder ahead of the first message, so that message is not slow. */
  prepareFolder(path: string): Promise<void>
}

/** Request/response channels (ipcRenderer.invoke ⇄ ipcMain.handle). */
/** Everything the Connections list does: handed to the page as one piece rather than eight. */
export type ConnectionActions = Pick<
  PuppyApi,
  | 'listConnections'
  | 'addConnection'
  | 'removeConnection'
  | 'chooseConnectionFile'
  | 'findConnectionFiles'
  | 'inspectConnectionFile'
  | 'previewConnection'
  | 'openConnectionRenewal'
>

export const Invoke = {
  getStatus: 'agent:get-status',
  restartAgent: 'agent:restart',
  updateApp: 'app:update',
  getUpdateAvailable: 'app:update-available',
  getAppInfo: 'app:info',
  revealLog: 'app:reveal-log',
  getVpnStatus: 'vpn:get',
  checkVpn: 'vpn:check',
  getSettings: 'settings:get',
  updateSettings: 'settings:update',
  listSessions: 'session:list',
  newSession: 'session:new',
  loadSession: 'session:load',
  setPermissionLevel: 'session:set-permission',
  renameSession: 'session:rename',
  deleteSession: 'session:delete',
  pinSession: 'session:pin',
  moveSession: 'session:move',
  listFolders: 'folder:list',
  createFolder: 'folder:create',
  updateFolder: 'folder:update',
  deleteFolder: 'folder:delete',
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
  listAgents: 'agents:list',
  setDefaultAgent: 'agents:set-default',
  getMcpState: 'mcp:state',
  listMcpMarketplace: 'mcp:marketplace',
  addMcpServer: 'mcp:add',
  removeMcpServer: 'mcp:remove',
  setMcpServerEnabled: 'mcp:set-enabled',
  signInToMcp: 'mcp:sign-in',
  listConnections: 'connections:list',
  addConnection: 'connections:add',
  removeConnection: 'connections:remove',
  chooseConnectionFile: 'connections:choose-file',
  inspectConnectionFile: 'connections:inspect-file',
  findConnectionFiles: 'connections:find-files',
  previewConnection: 'connections:preview',
  openConnectionRenewal: 'connections:open-renewal',
  listMcpCatalog: 'mcp:catalog',
  addMcpCatalogServer: 'mcp:add-catalog',
} as const satisfies Partial<Record<keyof PuppyApi, string>>

/** Push channels (main → renderer via webContents.send). */
export const Push = {
  status: 'agent:status',
  sessionUpdate: 'session:update',
  permissionRequest: 'permission:request',
  sessionsChanged: 'session:list-changed',
  quota: 'quota:changed',
  vpn: 'vpn:changed',
  modelSwitched: 'model:switched',
  updateAvailable: 'app:update-available-changed',
  mcpState: 'mcp:state-changed',
} as const
