import { ipcMain } from 'electron'
import { Invoke, Push, type AgentList } from '@shared/api'
import type { AgentPool } from './acp/agentPool'
import type { AgentCatalog } from './agentCatalog'
import type { McpService } from './mcpServers'
import type { SettingsStore } from './settings'

interface Deps {
  catalog: AgentCatalog
  mcp: McpService
  agents: AgentPool
  settings: SettingsStore
  push: (channel: string, payload?: unknown) => void
}

/** The Agents and MCP servers pages. */
export function registerCatalogIpc({ catalog, mcp, agents, settings, push }: Deps): void {
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
  ipcMain.handle(Invoke.addMcpCatalogServer, (_event, id, values) =>
    mcp.addFromCatalog(String(id), values && typeof values === 'object' ? (values as Record<string, unknown>) : {}),
  )
}
