import { ipcMain } from 'electron'
import { Invoke, type AgentList } from '@shared/api'
import type { AgentPool } from './acp/agentPool'
import type { AgentCatalog } from './agentCatalog'
import type { SettingsStore } from './settings'

interface Deps {
  catalog: AgentCatalog
  agents: AgentPool
  settings: SettingsStore
}

/** The Agents page. */
export function registerCatalogIpc({ catalog, agents, settings }: Deps): void {
  ipcMain.handle(Invoke.listAgents, () => catalog.list())
  ipcMain.handle(Invoke.setDefaultAgent, async (_event, name): Promise<AgentList> => {
    const { agents: available } = await catalog.list()
    if (!available.some((agent) => agent.name === name)) throw new Error('Code Puppy has no agent by that name.')
    const current = await catalog.use(String(name))
    settings.update({ defaultAgent: current }) // applied again at every launch: Code Puppy forgets it when Puppy quits
    await agents.restart() // each Code Puppy process reads the agent once, as it starts
    return { agents: available, current }
  })
}
