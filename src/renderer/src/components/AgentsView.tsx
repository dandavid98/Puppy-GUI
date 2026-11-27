import { useCallback, useEffect, useMemo, useState } from 'react'
import { MessageSquarePlus, RotateCw, Search } from 'lucide-react'
import type { AgentInfo, AgentList } from '@shared/api'
import { readableError } from '../state/usePuppy'
import { BUTTON, Page, SEARCH_INPUT, Section } from './ui/Page'
import { Select } from './ui/Select'

interface Props {
  listAgents: () => Promise<AgentList>
  setDefaultAgent: (name: string) => Promise<AgentList>
  /** Start a new chat with this text in the box. */
  onAsk: (text: string) => void
  /** A reply is in progress: switching agents restarts Code Puppy, which would stop it. */
  busy: boolean
}

/** What "Ask for this agent" puts in the box: the id is what Code Puppy needs to hand the task over. */
export const askText = (agent: AgentInfo) => `Use the ${agent.displayName.trim()} agent (${agent.name}) to `

const matches = (agent: AgentInfo, query: string) =>
  `${agent.displayName} ${agent.name} ${agent.description}`.toLowerCase().includes(query.trim().toLowerCase())

function Badge({ children, accent = false }: { children: string; accent?: boolean }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${accent ? 'bg-accent-soft text-accent' : 'bg-raised text-muted'}`}>{children}</span>
}

function AgentCard({ agent, isDefault, onAsk }: { agent: AgentInfo; isDefault: boolean; onAsk: () => void }) {
  return (
    <li className="flex flex-col rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{agent.displayName}</h3>
        {isDefault && <Badge accent>Default</Badge>}
        {agent.custom && <Badge>Custom</Badge>}
      </div>
      <p className="mt-1 line-clamp-3 flex-1 text-sm text-muted">{agent.description || 'No description.'}</p>
      <button type="button" onClick={onAsk} aria-label={`Ask for ${agent.displayName.trim()}`} className={`${BUTTON} mt-3 self-start`}>
        <MessageSquarePlus size={14} aria-hidden />
        Ask for this agent
      </button>
    </li>
  )
}

export function AgentsView({ listAgents, setDefaultAgent, onAsk, busy }: Props) {
  const [list, setList] = useState<AgentList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [switching, setSwitching] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    listAgents().then(setList, (failure: unknown) => setError(readableError(failure)))
  }, [listAgents])
  useEffect(load, [load])

  const shown = useMemo(() => list?.agents.filter((agent) => matches(agent, query)) ?? [], [list, query])
  const nameOf = (name: string) => list?.agents.find((agent) => agent.name === name)?.displayName.trim() ?? name

  const choose = (name: string) => {
    if (name === list?.current || switching) return
    if (busy) return setNote('Code Puppy is still replying. Switch once it has finished, so the reply is not cut off.')
    setSwitching(true)
    setNote(null)
    setDefaultAgent(name)
      .then((next) => {
        setList(next)
        setNote(`New chats now start with ${nameOf(next.current)}.`)
      })
      .catch((failure: unknown) => setNote(`Could not switch: ${readableError(failure)}`))
      .finally(() => setSwitching(false))
  }

  return (
    <Page title="Agents" description="Code Puppy's specialists. Ask for one in a chat and Code Puppy hands the task over to it.">
      {error ? (
        <Section title="Could not load the agents">
          <p className="text-sm text-danger">{error}</p>
          <button type="button" onClick={load} className={`${BUTTON} mt-3`}>
            <RotateCw size={14} aria-hidden />
            Try again
          </button>
        </Section>
      ) : !list ? (
        <p role="status" className="text-sm text-muted">Loading agents...</p>
      ) : (
        <>
          <Section
            title="Default agent"
            description="New chats in Puppy start with this agent. Code Puppy in the terminal keeps its own. Switching restarts Code Puppy."
          >
            <Select
              label="Default agent"
              variant="field"
              value={list.current}
              options={list.agents.map((agent) => ({ value: agent.name, label: agent.displayName.trim(), description: agent.description }))}
              onChange={choose}
            />
            <p role="status" className="mt-3 text-sm text-muted empty:hidden">
              {switching ? 'Switching agents and restarting Code Puppy...' : note}
            </p>
          </Section>

          <div className="relative">
            <Search size={15} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input type="search" aria-label="Search agents" placeholder={`Search ${list.agents.length} agents`} value={query} onChange={(event) => setQuery(event.target.value)} className={SEARCH_INPUT} />
          </div>

          {shown.length ? (
            <ul aria-label="Agents" className="grid gap-3 sm:grid-cols-2">
              {shown.map((agent) => (
                <AgentCard key={agent.name} agent={agent} isDefault={agent.name === list.current} onAsk={() => onAsk(askText(agent))} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No agent matches "{query}".</p>
          )}
        </>
      )}
    </Page>
  )
}
