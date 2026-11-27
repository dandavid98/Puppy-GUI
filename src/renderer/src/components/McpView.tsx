import { useCallback, useEffect, useMemo, useState } from 'react'
import { BadgeCheck, Check, LogIn, Plus, RotateCw, Search, Trash2 } from 'lucide-react'
import type { McpListing, McpState } from '@shared/api'
import { readableError } from '../state/usePuppy'
import { BUTTON, Page, SEARCH_INPUT, Section } from './ui/Page'
import { Switch } from './ui/Switch'

interface Props {
  mcp: McpState | null
  listMarketplace: () => Promise<McpListing[]>
  addServer: (id: string) => Promise<McpState>
  removeServer: (id: string) => Promise<McpState>
  setServerEnabled: (id: string, enabled: boolean) => Promise<McpState>
  signIn: () => Promise<McpState>
}

/** Enough to scan; searching narrows the rest. */
const SHOWN = 40

const matches = (listing: McpListing, query: string) =>
  `${listing.displayName} ${listing.description} ${listing.author} ${listing.tags.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())

function SignIn({ signedIn, onSignIn }: { signedIn: boolean | null | undefined; onSignIn: () => Promise<McpState> }) {
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const signIn = () => {
    setWaiting(true)
    setError(null)
    onSignIn()
      .then((state) => state.signedIn || setError('Signing in did not finish. Try again, and complete the sign-in in Chrome.'))
      .catch((failure: unknown) => setError(readableError(failure)))
      .finally(() => setWaiting(false))
  }
  return (
    <Section
      title="Walmart sign-in"
      description="Marketplace servers need your Walmart SSO sign-in. Chrome opens for a moment, and closes by itself if you are already signed in."
    >
      <div className="flex flex-wrap items-center gap-3">
        <p role="status" className="flex-1 text-sm">
          {waiting ? 'Waiting for you to finish in Chrome...' : signedIn ? 'Signed in.' : signedIn === false ? 'Not signed in: your servers wait until you are.' : 'Checking...'}
        </p>
        {!signedIn && (
          <button type="button" onClick={signIn} disabled={waiting} className={BUTTON}>
            <LogIn size={14} aria-hidden />
            Sign in
          </button>
        )}
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </Section>
  )
}

export function McpView({ mcp, listMarketplace, addServer, removeServer, setServerEnabled, signIn }: Props) {
  const [listings, setListings] = useState<McpListing[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoadError(null)
    listMarketplace().then(setListings, (failure: unknown) => setLoadError(readableError(failure)))
  }, [listMarketplace])
  useEffect(load, [load])

  const added = useMemo(() => new Set(mcp?.servers.map((server) => server.id)), [mcp])
  const found = useMemo(() => listings?.filter((listing) => matches(listing, query)) ?? [], [listings, query])

  const attempt = (work: () => Promise<unknown>) => {
    setError(null)
    return work().catch((failure: unknown) => setError(readableError(failure)))
  }
  const add = (id: string) => {
    setAdding(id)
    void attempt(() => addServer(id)).finally(() => setAdding(null))
  }

  return (
    <Page
      title="MCP servers"
      description="Give Code Puppy more tools from Walmart's MCP marketplace. Servers you add here are Puppy's only: Code Puppy in the terminal does not see them. They join new chats, and chats you reopen."
    >
      <SignIn signedIn={mcp?.signedIn} onSignIn={signIn} />
      {error && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}

      <Section title="Your servers">
        {mcp?.servers.length ? (
          <ul aria-label="Your servers" className="divide-y divide-line">
            {mcp.servers.map((server) => (
              <li key={server.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <Switch label={server.displayName} checked={server.enabled} onChange={(enabled) => void attempt(() => setServerEnabled(server.id, enabled))} />
                </div>
                <button type="button" onClick={() => void attempt(() => removeServer(server.id))} aria-label={`Remove ${server.displayName}`} title="Remove" className="rounded-md p-1.5 text-muted hover:bg-raised hover:text-danger">
                  <Trash2 size={15} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">None yet. Add one from the marketplace below.</p>
        )}
      </Section>

      <Section title="Walmart MCP marketplace" description={listings ? `${listings.length} servers. Each adds its tools to Code Puppy.` : undefined}>
        {loadError ? (
          <div>
            <p className="text-sm text-danger">Could not read the marketplace: {loadError}</p>
            <button type="button" onClick={load} className={`${BUTTON} mt-3`}>
              <RotateCw size={14} aria-hidden />
              Try again
            </button>
          </div>
        ) : !listings ? (
          <p role="status" className="text-sm text-muted">Loading the marketplace...</p>
        ) : (
          <>
            <div className="relative">
              <Search size={15} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
              <input type="search" aria-label="Search the marketplace" placeholder="Search by name, team or tag" value={query} onChange={(event) => setQuery(event.target.value)} className={SEARCH_INPUT} />
            </div>
            <ul aria-label="Marketplace servers" className="mt-3 divide-y divide-line">
              {found.slice(0, SHOWN).map((listing) => (
                <li key={listing.id} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="text-sm font-medium">{listing.displayName}</h3>
                      {listing.verified && <BadgeCheck size={14} className="text-accent" aria-label="Verified" />}
                    </div>
                    {listing.author && <p className="text-xs text-muted">{listing.author}</p>}
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{listing.description}</p>
                  </div>
                  {added.has(listing.id) ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-muted">
                      <Check size={14} aria-hidden />
                      Added
                    </span>
                  ) : (
                    <button type="button" onClick={() => add(listing.id)} disabled={adding !== null} aria-label={`Add ${listing.displayName}`} className={BUTTON}>
                      <Plus size={14} aria-hidden />
                      {adding === listing.id ? 'Adding...' : 'Add'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">
              {found.length > SHOWN ? `Showing ${SHOWN} of ${found.length}. Search to find others.` : found.length ? null : `Nothing matches "${query}".`}
            </p>
          </>
        )}
      </Section>
    </Page>
  )
}
