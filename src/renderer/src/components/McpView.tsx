import { useCallback, useMemo, useState } from 'react'
import { BadgeCheck, Trash2 } from 'lucide-react'
import { catalogServerId, type ConnectionDraft, type ConnectionInfo, type McpCatalogEntry, type McpListing, type McpState } from '@shared/api'
import { readableError } from '../state/usePuppy'
import { ConnectionsSection } from './ConnectionsSection'
import { McpCatalogItem } from './McpCatalogItem'
import { AddControl, McpSearchList } from './McpSearchList'
import { Page, Section } from './ui/Page'
import { Switch } from './ui/Switch'

interface Props {
  mcp: McpState | null
  listMarketplace: () => Promise<McpListing[]>
  listCatalog: () => Promise<McpCatalogEntry[]>
  addServer: (id: string) => Promise<McpState>
  addCatalogServer: (id: string, values: Record<string, string>) => Promise<McpState>
  removeServer: (id: string) => Promise<McpState>
  setServerEnabled: (id: string, enabled: boolean) => Promise<McpState>
  signIn: () => Promise<McpState>
  listConnections: () => Promise<ConnectionInfo[]>
  addConnection: (draft: ConnectionDraft) => Promise<ConnectionInfo[]>
  removeConnection: (id: string) => Promise<ConnectionInfo[]>
  chooseConnectionFile: () => Promise<string | null>
  openConnectionRenewal: (id: string) => Promise<void>
}

const listingText = (listing: McpListing) => `${listing.displayName} ${listing.description} ${listing.author} ${listing.tags.join(' ')}`
const entryText = (entry: McpCatalogEntry) => `${entry.displayName} ${entry.description} ${entry.category} ${entry.tags.join(' ')}`

export function McpView({ mcp, listMarketplace, listCatalog, addServer, addCatalogServer, removeServer, setServerEnabled, signIn, listConnections, addConnection, removeConnection, chooseConnectionFile, openConnectionRenewal }: Props) {
  const [adding, setAdding] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const added = useMemo(() => new Set(mcp?.servers.map((server) => server.id)), [mcp])
  // The ones that can run on this Mac first.
  const loadCatalog = useCallback(async () => (await listCatalog()).sort((a, b) => Number(!!a.unavailable) - Number(!!b.unavailable)), [listCatalog])

  const attempt = (work: () => Promise<unknown>) => {
    setError(null)
    return work().catch((failure: unknown) => setError(readableError(failure)))
  }
  const add = (id: string) => {
    setAdding(id)
    void attempt(() => addServer(id)).finally(() => setAdding(null))
  }
  const busy = adding !== null || checking

  return (
    <Page
      title="MCP servers"
      description="Give Code Puppy more tools, from Walmart's MCP marketplace or Code Puppy's own catalog. Servers you add here are Puppy's only: Code Puppy in the terminal does not see them. They join new chats, and chats you reopen."
    >
      <ConnectionsSection
        signedIn={mcp?.signedIn}
        list={listConnections}
        add={addConnection}
        remove={removeConnection}
        chooseFile={chooseConnectionFile}
        openRenewal={openConnectionRenewal}
        signIn={signIn}
      />
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
          <p className="text-sm text-muted">None yet. Add one from the marketplace or the catalog below.</p>
        )}
      </Section>

      <McpSearchList
        title="Code Puppy catalog"
        what="Code Puppy's catalog"
        load={loadCatalog}
        describe={(entries) => `${entries.length} servers. Ones whose package no longer exists are left out, and ones this Mac cannot run say what they need.`}
        searchLabel="Search the catalog"
        placeholder="Search by name, category or tag"
        listLabel="Catalog servers"
        searchText={entryText}
        keyOf={(entry) => entry.id}
      >
        {(entry) => (
          <McpCatalogItem
            entry={entry}
            added={added.has(catalogServerId(entry.id))}
            locked={busy}
            onAdd={(values) => addCatalogServer(entry.id, values)}
            onBusy={setChecking}
          />
        )}
      </McpSearchList>

      <McpSearchList
        title="Walmart MCP marketplace"
        what="the marketplace"
        load={listMarketplace}
        describe={(listings) => `${listings.length} servers. Each adds its tools to Code Puppy.`}
        searchLabel="Search the marketplace"
        placeholder="Search by name, team or tag"
        listLabel="Marketplace servers"
        searchText={listingText}
        keyOf={(listing) => listing.id}
      >
        {(listing) => (
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="text-sm font-medium">{listing.displayName}</h3>
                {listing.verified && <BadgeCheck size={14} className="text-accent" aria-label="Verified" />}
              </div>
              {listing.author && <p className="text-xs text-muted">{listing.author}</p>}
              <p className="mt-1 line-clamp-2 text-sm text-muted">{listing.description}</p>
            </div>
            <AddControl name={listing.displayName} added={added.has(listing.id)} busy={adding === listing.id} disabled={busy} onAdd={() => add(listing.id)} />
          </div>
        )}
      </McpSearchList>
    </Page>
  )
}
