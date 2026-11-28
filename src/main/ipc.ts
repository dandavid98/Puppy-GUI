import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'
import { Invoke, Push, type AppInfo, type Settings } from '@shared/api'
import { isPermissionLevel } from '@shared/permissions'
import { isLocalUrl, previewTarget } from '@shared/preview'
import type { AgentPool } from './acp/agentPool'
import type { ModelFallback } from './modelFallback'
import { waitForServer } from './localServer'
import { readContextLengths } from './modelCatalog'
import type { Organizer } from './organizer'
import { openInBrowser, writePreviewHtml } from './preview'
import type { QuotaService } from './quota'
import type { SettingsStore } from './settings'
import { updatePuppy } from './updater'
import type { UpdateWatch } from './updateWatch'
import type { VpnWatch } from './vpn'
import type { Workspace } from './workspace'

interface Deps {
  agents: AgentPool
  /** Where the agents' updates go on their way to the window. */
  fallback: ModelFallback
  workspace: Workspace
  organizer: Organizer
  settings: SettingsStore
  quota: QuotaService
  vpn: VpnWatch
  updates: UpdateWatch
  info: AppInfo
  /** Where HTML from chat code blocks is written for previewing. */
  previewDir: string
  window: () => BrowserWindow | null
}

/** Electron draws the window chrome, scrollbars and dialogs; CSS media queries follow it too. */
export function applyTheme(settings: Settings): void {
  nativeTheme.themeSource = settings.theme
}

/** Wires the `window.puppy` contract (src/shared/api.ts) to the main process. */
export function registerIpc({ agents, fallback, workspace, organizer, settings, quota, vpn, updates, info, previewDir, window }: Deps): void {
  const push = (channel: string, payload?: unknown) => window()?.webContents.send(channel, payload)
  agents.on('status', (status) => push(Push.status, status))
  agents.on('sessionUpdate', (notification) => fallback.route(notification)) // on to the window, unless it is a limit about to be handled
  workspace.on('modelSwitched', (change) => push(Push.modelSwitched, change))
  agents.on('permissionRequest', (prompt) => push(Push.permissionRequest, prompt))
  workspace.on('changed', () => push(Push.sessionsChanged))
  quota.on('changed', (snapshot) => push(Push.quota, snapshot))
  vpn.on('changed', (status) => push(Push.vpn, status))
  updates.on('changed', (available) => push(Push.updateAvailable, available))

  ipcMain.handle(Invoke.getStatus, () => agents.status)
  ipcMain.handle(Invoke.restartAgent, () => agents.restart())
  ipcMain.handle(Invoke.getUpdateAvailable, () => updates.available)
  ipcMain.handle(Invoke.updateApp, async () => {
    const outcome = await updatePuppy({
      appPath: app.getAppPath(),
      packaged: app.isPackaged,
      dataPath: info.dataPath,
      pid: process.pid,
      confirm: async (detail) => {
        const options = { type: 'question' as const, message: 'Update Puppy?', detail, buttons: ['Update and restart', 'Not now'], defaultId: 0, cancelId: 1 }
        const parent = window()
        const { response } = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
        return response === 0
      },
      quit: () => app.quit(),
    })
    void updates.check() // said "up to date", or not: the badge should agree
    return outcome
  })
  ipcMain.handle(Invoke.getAppInfo, () => info)
  ipcMain.handle(Invoke.revealLog, () => shell.showItemInFolder(info.logPath))
  ipcMain.handle(Invoke.getVpnStatus, () => vpn.status)
  ipcMain.handle(Invoke.checkVpn, () => vpn.check())
  ipcMain.handle(Invoke.getSettings, () => settings.get())
  ipcMain.handle(Invoke.updateSettings, (_event, patch) => {
    const next = settings.update(patch)
    applyTheme(next)
    return next
  })
  ipcMain.handle(Invoke.listSessions, () => workspace.list())
  ipcMain.handle(Invoke.newSession, (_event, kind, cwd) => workspace.create(kind, cwd))
  ipcMain.handle(Invoke.loadSession, (_event, sessionId, cwd) => workspace.load(sessionId, cwd))
  ipcMain.handle(Invoke.setPermissionLevel, (_event, sessionId, level) => {
    if (!isPermissionLevel(level)) throw new Error('Unknown permission level.')
    return workspace.setPermissionLevel(String(sessionId), level)
  })
  ipcMain.handle(Invoke.renameSession, (_event, sessionId, title) => workspace.rename(sessionId, title))
  ipcMain.handle(Invoke.deleteSession, (_event, sessionId) => workspace.remove(sessionId))
  ipcMain.handle(Invoke.pinSession, (_event, sessionId, pinned) => organizer.pin(String(sessionId), pinned))
  ipcMain.handle(Invoke.moveSession, (_event, sessionId, folderId) =>
    organizer.move(String(sessionId), folderId === null ? null : String(folderId)),
  )
  ipcMain.handle(Invoke.listFolders, () => organizer.listFolders())
  ipcMain.handle(Invoke.createFolder, (_event, name, kind) => organizer.createFolder(name, kind))
  ipcMain.handle(Invoke.updateFolder, (_event, id, patch) => organizer.updateFolder(String(id), patch ?? {}))
  ipcMain.handle(Invoke.deleteFolder, (_event, id) => organizer.deleteFolder(String(id)))
  ipcMain.handle(Invoke.prompt, (_event, sessionId, text, attachments) => {
    void vpn.check() // off the VPN the turn just hangs; this is how the UI finds out why
    return workspace.prompt(sessionId, text, attachments)
  })
  ipcMain.handle(Invoke.cancel, (_event, sessionId) => workspace.cancel(sessionId))
  ipcMain.handle(Invoke.getConfigOptions, () => workspace.configOptions())
  ipcMain.handle(Invoke.setModel, (_event, value, sessionId) => workspace.setModel(value, sessionId))
  ipcMain.handle(Invoke.answerPermission, (_event, requestId, optionId) => agents.answerPermission(requestId, optionId))
  ipcMain.handle(Invoke.previewHtml, (_event, html) => {
    if (typeof html !== 'string') throw new Error('Nothing to preview.')
    return previewTarget(writePreviewHtml(previewDir, html))
  })
  ipcMain.handle(Invoke.openInBrowser, (_event, target) =>
    openInBrowser(String(target), [previewDir, ...workspace.roots]),
  )
  ipcMain.handle(Invoke.waitForServer, (_event, url) => isLocalUrl(String(url)) && waitForServer(String(url)))
  ipcMain.handle(Invoke.getQuota, () => quota.snapshot)
  ipcMain.handle(Invoke.refreshQuota, () => quota.refresh())
  ipcMain.handle(Invoke.prepareFolder, (_event, path) => workspace.prepare(String(path)))
  ipcMain.handle(Invoke.getModelContexts, () => readContextLengths())
  ipcMain.handle(Invoke.chooseFolder, async () => {
    const parent = window()
    const options = { title: 'Choose a project folder', properties: ['openDirectory' as const, 'createDirectory' as const] }
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    return result.canceled ? null : result.filePaths[0]
  })
}
