import type { AgentInfo, AgentList } from '@shared/api'
import { runPython, runScript, type Runner } from './codePuppyPython'

/**
 * Code Puppy's agents, read and chosen through its own agent manager.
 *
 * Code Puppy keeps the current agent per "terminal session", keyed by the
 * PARENT process id. Every Code Puppy process Puppy starts, and every script
 * it runs, is a child of Puppy's main process: so choosing an agent here
 * changes it for Puppy only, never for a terminal. Each Code Puppy process
 * reads the choice once, when it starts, so a new choice takes a restart.
 */

const LIST_SCRIPT = `
from code_puppy.agents import agent_manager as manager
names = manager.get_available_agents()
descriptions = manager.get_agent_descriptions()
emit({
    "agents": [
        {"name": name, "displayName": display, "description": descriptions.get(name, ""),
         "custom": isinstance(manager._AGENT_REGISTRY.get(name), str)}  # JSON agents are the user's own
        for name, display in names.items()
    ],
    "current": manager.get_current_agent_name(),
})
`

const USE_SCRIPT = `
from code_puppy.agents.agent_manager import get_available_agents, get_current_agent_name, set_current_agent
if sys.argv[1] in get_available_agents():
    set_current_agent(sys.argv[1])
emit({"current": get_current_agent_name()})
`

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/** Validate the script's output. Throws when it is unusable, so the UI can say so. */
export function toAgentList(emitted: unknown): AgentList {
  const raw = (emitted ?? {}) as { agents?: unknown; current?: unknown }
  if (!Array.isArray(raw.agents) || typeof raw.current !== 'string') throw new Error('Code Puppy did not list its agents.')
  const agents: AgentInfo[] = raw.agents
    .filter((agent): agent is Record<string, unknown> => !!agent && typeof agent === 'object' && typeof agent.name === 'string')
    .map((agent) => ({
      name: text(agent.name),
      displayName: text(agent.displayName) || text(agent.name),
      description: text(agent.description),
      custom: agent.custom === true,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
  return { agents, current: raw.current }
}

export class AgentCatalog {
  constructor(
    private readonly python: () => string | null,
    private readonly run: Runner = runPython,
  ) {}

  private interpreter(): string {
    const python = this.python()
    if (!python) throw new Error('Code Puppy is not installed where Puppy can find it.')
    return python
  }

  async list(): Promise<AgentList> {
    return toAgentList(await runScript(this.interpreter(), LIST_SCRIPT, { network: false }, this.run))
  }

  /** Make `name` current for Puppy's Code Puppy processes; resolves to the agent that is current afterwards. */
  async use(name: string): Promise<string> {
    const emitted = (await runScript(this.interpreter(), USE_SCRIPT, { args: [name], network: false }, this.run)) as { current?: unknown } | null
    if (typeof emitted?.current !== 'string') throw new Error('Code Puppy did not switch agents.')
    return emitted.current
  }
}
