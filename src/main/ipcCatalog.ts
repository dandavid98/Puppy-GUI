import { dialog, ipcMain, type BrowserWindow } from 'electron'
import { Invoke, Push, type AgentList, type ConnectionDraft } from '@shared/api'
import type { AgentPool } from './acp/agentPool'
import type { AgentCatalog } from './agentCatalog'
import type { ConnectionService } from './connections'
import type { McpService } from './mcpServers'
import { openWebPage } from './preview'
import type { SettingsStore } from './settings'

interface Deps {
  catalog: AgentCatalog
  mcp: McpService
  connections: ConnectionService
  agents: AgentPool
  settings: SettingsStore
  window: () => BrowserWindow | null
  push: (channel: string, payload?: unknown) => void
}

/** The Agents and MCP servers pages. */
export function registerCatalogIpc({ catalog, mcp, connections, agents, settings, window, push }: Deps): void {
  mcp.on('changed', (state) => push(Push.mcpState, state))

  ipcMain.handle(Invoke.listAgents, () => catalog.list())
  ipcMain.handle(Invoke.setDefaultAgent, async (_event, name): Promise<AgentList> => {
    const { agents: available } = await catalog.list()
    if (!available.some((agent) => agent.name === name)) throw new Error('Code Puppy has no agent by that name.')
    const current = await catalog.use(String(name))
    settings.update({ defaultAgent: current }) // applied again at every launch: Code Puppy forgets it when Puppy quits
    await agents.restart() // each Code Puppy process reads the agent once, as it starts
    return { agents: available, current }
  })

  ipcMain.handle(Invoke.getMcpState, () => {
    void mcp.checkSignIn().catch(() => undefined) // arrives as a push
    return mcp.state
  })
  ipcMain.handle(Invoke.listMcpMarketplace, () => mcp.marketplace())
  ipcMain.handle(Invoke.addMcpServer, (_event, id) => mcp.add(String(id)))
  ipcMain.handle(Invoke.removeMcpServer, (_event, id) => mcp.remove(String(id)))
  ipcMain.handle(Invoke.setMcpServerEnabled, (_event, id, enabled) => mcp.setEnabled(String(id), enabled === true))
  ipcMain.handle(Invoke.signInToMcp, () => mcp.signIn())
  ipcMain.handle(Invoke.listMcpCatalog, () => mcp.catalog())

  ipcMain.handle(Invoke.listConnections, () => connections.list())
  ipcMain.handle(Invoke.inspectConnectionFile, (_event, file) => connections.inspectFile(String(file)))
  ipcMain.handle(Invoke.previewConnection, (_event, draft) => connections.preview((draft ?? {}) as ConnectionDraft))
  ipcMain.handle(Invoke.addConnection, (_event, draft) => connections.add((draft ?? {}) as ConnectionDraft))
  ipcMain.handle(Invoke.removeConnection, (_event, id) => connections.remove(String(id)))
  ipcMain.handle(Invoke.openConnectionRenewal, async (_event, id) => {
    const url = connections.renewalUrl(String(id))
    if (!url) throw new Error('That connection has no renewal page.')
    await openWebPage(url)
  })
  ipcMain.handle(Invoke.chooseConnectionFile, async () => {
    const parent = window()
    // Hidden files shown: tokens live in files like .env.local.
    const options = { title: 'Choose the file that holds the token', properties: ['openFile' as const, 'showHiddenFiles' as const] }
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle(Invoke.addMcpCatalogServer, (_event, id, values) =>
    mcp.addFromCatalog(String(id), values && typeof values === 'object' ? (values as Record<string, unknown>) : {}),
  )
}
