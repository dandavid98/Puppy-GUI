import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, nativeTheme, powerMonitor, session, shell } from 'electron'
import { AgentPool } from './acp/agentPool'
import { PuppyAgent } from './acp/puppyAgent'
import { FolderStore } from './folders'
import { applyTheme, registerIpc } from './ipc'
import { locateCodePuppy } from './locateCodePuppy'
import { readContextLengths } from './modelCatalog'
import { Organizer } from './organizer'
import { allowLocalFraming, handlePreviewProtocol, registerPreviewScheme } from './preview'
import { pythonNextTo, QuotaService } from './quota'
import { SessionIndex } from './sessionIndex'
import { SettingsStore } from './settings'
import { updateAvailable } from './updater'
import { UpdateWatch } from './updateWatch'
import { VpnWatch } from './vpn'
import { Workspace } from './workspace'

let mainWindow: BrowserWindow | null = null
const ICON_PNG = join(__dirname, '../../build/icon.png')

// Lets E2E tests run against a throwaway profile instead of real chats.
if (process.env.PUPPY_DESKTOP_USER_DATA) app.setPath('userData', process.env.PUPPY_DESKTOP_USER_DATA)
registerPreviewScheme() // must happen before the app is ready

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 760,
    minHeight: 520,
    show: false,
    title: 'Puppy',
    titleBarStyle: 'hiddenInset', // frameless look: traffic lights float over the sidebar
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1d1b' : '#faf9f7',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  window.once('ready-to-show', () => window.show())

  // Links in answers open in the user's browser, never inside the app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) {
      event.preventDefault()
      if (/^https?:/.test(url)) void shell.openExternal(url)
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void window.loadFile(join(__dirname, '../renderer/index.html'))
  return window
}

function openWindow(): void {
  mainWindow = createWindow()
  mainWindow.on('closed', () => (mainWindow = null))
}

// One Puppy per data folder: two copies would fight over sessions.json and one code-puppy.
const isFirstInstance = app.requestSingleInstanceLock()
if (!isFirstInstance) app.quit()
app.on('second-instance', () => {
  if (mainWindow?.isMinimized()) mainWindow.restore()
  mainWindow?.focus()
})

void app.whenReady().then(() => {
  if (!isFirstInstance) return
  const data = app.getPath('userData')
  const info = { version: app.getVersion(), dataPath: data, logPath: join(data, 'code-puppy.log') }
  const settings = new SettingsStore(join(data, 'settings.json'))
  applyTheme(settings.get())

  // One Code Puppy per project folder; chats and scratch sessions share the one started in the chat folder.
  const chatDir = join(data, 'chat-workspace')
  const agents = new AgentPool((folder) => new PuppyAgent(locateCodePuppy, folder, info.logPath, info.version), chatDir)
  const index = new SessionIndex(join(data, 'sessions.json'))
  const workspace = new Workspace(agents, index, settings, chatDir, () => readContextLengths())
  const organizer = new Organizer(index, new FolderStore(join(data, 'folders.json')))

  // The user's real quota, read through code-puppy's own Python (never touching their token).
  const quota = new QuotaService(() => pythonNextTo(locateCodePuppy()))
  workspace.on('turn', () => quota.refreshSoon())

  const previewDir = join(data, 'previews')
  handlePreviewProtocol(() => [previewDir, ...workspace.roots])
  allowLocalFraming(session.defaultSession)
  const vpn = new VpnWatch()
  const updates = new UpdateWatch(() => updateAvailable({ appPath: app.getAppPath(), packaged: app.isPackaged }))
  registerIpc({ agents, workspace, organizer, settings, quota, vpn, updates, info, previewDir, window: () => mainWindow })
  openWindow()
  mkdirSync(chatDir, { recursive: true }) // the home process starts in it
  void agents.home.context().catch(() => undefined) // warm up now; errors reach the UI via status events
  quota.start()
  void vpn.check() // so a launch off the VPN says so straight away
  updates.start() // and so a waiting update gets its badge
  // Timers do not count the time a Mac spends asleep, so the reset-time refresh can wake up late: read again on wake.
  powerMonitor.on('resume', () => {
    quota.refreshSoon()
    void vpn.check() // a laptop lid closed at the office wakes up at home
    void updates.check()
  })

  if (app.dock && existsSync(ICON_PNG)) app.dock.setIcon(ICON_PNG) // dev runs show the puppy, not Electron's atom
  app.on('activate', () => mainWindow ?? openWindow())
  app.on('before-quit', () => {
    quota.stop()
    vpn.stop()
    updates.stop()
    agents.stop()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
