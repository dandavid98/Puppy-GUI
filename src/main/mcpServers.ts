import { EventEmitter } from 'node:events'
import type { McpServer } from '@agentclientprotocol/sdk'
import { catalogIdOf, catalogServerId, type McpCatalogEntry, type McpListing, type McpSource, type McpState } from '@shared/api'
import { readJson, writeJsonAtomic } from './jsonFile'
import type { Catalog, CatalogTemplate } from './mcpCatalog'
import type { Marketplace, MarketplaceToken } from './mcpMarketplace'
import { correctCatalogSpec, mentions, packageMirrors, parseSpec, strings, TOKEN_VARIABLE, toAcpSpec, type ServerSpec } from './mcpSpec'
import type { McpVault } from './mcpVault'

/**
 * The MCP servers the user added to Puppy, from Walmart's marketplace or Code
 * Puppy's catalog. Kept in Puppy's own data folder (never in code-puppy's
 * mcp_servers.json, so the terminal is unaffected) and handed to Code Puppy per
 * chat through ACP when a session starts.
 *
 * What a server needs at start (the marketplace sign-in, the user's API keys and
 * settings) is saved as placeholders and filled in here, in memory: the token is
 * read from code-puppy's sign-in, keys from the encrypted vault. Neither is sent
 * to the window or written in the clear.
 */

export type StoredMcpServer = {
  id: string
  /** Code Puppy's name for it: the start of its tool names. */
  name: string
  displayName: string
  source: McpSource
  enabled: boolean
  /** The values it needs when a chat starts. */
  variables: string[]
} & ServerSpec

/** A token this close to expiring is read again rather than handed to a new chat. */
const TOKEN_MARGIN_MS = 5 * 60_000
/** Long enough for a server's tools to be told apart, short enough that "prefix_tool" stays within models' 64-character limit. */
const MAX_PREFIX = 16

/** Short, unique, model-safe tool-name prefixes: "accelerator-mcp" stays, "sof0001528-activemq-mcp-server" is trimmed. */
export function toolPrefixes(names: string[]): string[] {
  const taken = new Set<string>()
  return names.map((name) => {
    const base = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, MAX_PREFIX).replace(/-+$/, '') || 'mcp'
    let prefix = base
    for (let n = 2; taken.has(prefix); n++) prefix = `${base.slice(0, MAX_PREFIX - String(n).length)}${n}`
    taken.add(prefix)
    return prefix
  })
}

/** ACP specs for the enabled servers. Ones still missing a value (no sign-in, a key that cannot be read) are left out rather than sent to fail. */
export function toAcpServers(servers: StoredMcpServer[], valuesFor: (server: StoredMcpServer) => Record<string, string>, mirrors: Record<string, string> = {}): McpServer[] {
  const usable = servers
    .filter((server) => server.enabled)
    .map((server) => ({ server, values: valuesFor(server) }))
    .filter(({ server, values }) => server.variables.every((name) => values[name]))
  const prefixes = toolPrefixes(usable.map(({ server }) => server.name))
  return usable.map(({ server, values }, index) => toAcpSpec(server, prefixes[index], values, mirrors))
}

/** Saved servers, including ones from before catalog servers existed (marketplace only, token implied by the headers). */
export function readServers(path: string): StoredMcpServer[] {
  const saved = readJson<unknown>(path, [])
  if (!Array.isArray(saved)) return []
  return saved.flatMap((raw: Record<string, unknown>) => {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || typeof raw.name !== 'string') return []
    const parsed = parseSpec(raw.type ?? 'http', raw)
    if (!parsed) return []
    const source = raw.source === 'catalog' ? 'catalog' : 'marketplace'
    const spec = source === 'catalog' ? correctCatalogSpec(catalogIdOf(raw.id), parsed) : parsed
    return [{
      id: raw.id,
      name: raw.name,
      displayName: typeof raw.displayName === 'string' && raw.displayName ? raw.displayName : raw.id,
      source,
      enabled: raw.enabled !== false,
      variables: Array.isArray(raw.variables) ? strings(raw.variables) : mentions(spec, TOKEN_VARIABLE) ? [TOKEN_VARIABLE] : [],
      ...spec,
    } satisfies StoredMcpServer]
  })
}

/** Loaded once per run; a failure is tried again next time. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let loading: Promise<T> | null = null
  return () =>
    (loading ??= load().catch((error: unknown) => {
      loading = null
      throw error
    }))
}

/** What the user typed, completed with defaults and checked: only the entry's own fields are kept. */
export function completeValues(entry: McpCatalogEntry, typed: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    entry.fields.map((field) => {
      const value = (typeof typed[field.name] === 'string' ? (typed[field.name] as string).trim() : '') || field.default
      if (!value && field.required) throw new Error(`${field.label} is needed.`)
      return [field.name, value]
    }).filter(([, value]) => value),
  )
}

export interface McpSources {
  market: Marketplace
  catalog: Catalog
  vault: McpVault
  /** Where a remote server really lives (see redirects.ts). */
  resolveUrl?: (url: string) => Promise<string>
}

export class McpService extends EventEmitter<{ changed: [McpState] }> {
  private servers: StoredMcpServer[]
  private signedIn: boolean | null = null
  private cached: { token: string; expiresAtMs: number } | null = null
  readonly marketplace: () => Promise<McpListing[]>
  private readonly templates: () => Promise<CatalogTemplate[]>

  constructor(
    private readonly path: string,
    private readonly sources: McpSources,
    private readonly now: () => number = Date.now,
  ) {
    super()
    this.servers = readServers(path)
    this.marketplace = once(() => sources.market.list()) // code-puppy caches it on disk too
    this.templates = once(() => sources.catalog.list())
  }

  get state(): McpState {
    return { servers: this.servers.map(({ id, displayName, enabled, source }) => ({ id, displayName, enabled, source })), signedIn: this.signedIn }
  }

  async catalog(): Promise<McpCatalogEntry[]> {
    return (await this.templates()).map(({ entry }) => entry)
  }

  async add(id: string): Promise<McpState> {
    if (!this.has(id)) {
      const config = await this.sources.market.config(id)
      if (!config) throw new Error('That server is no longer in the marketplace.')
      const { id: _id, name, displayName, ...listed } = config
      const spec = this.sources.resolveUrl ? { ...listed, url: await this.sources.resolveUrl(listed.url) } : listed
      const variables = mentions(spec, TOKEN_VARIABLE) ? [TOKEN_VARIABLE] : []
      this.save([...this.servers, { id, name, displayName, source: 'marketplace', enabled: true, variables, ...spec }])
    }
    return this.state
  }

  /** Starts it once first: a server that cannot start (bad key, broken package) is not added, and the reason is the error. */
  async addFromCatalog(catalogId: string, typed: Record<string, unknown>): Promise<McpState> {
    const id = catalogServerId(catalogId)
    if (this.has(id)) return this.state
    const template = (await this.templates()).find(({ entry }) => entry.id === catalogId)
    if (!template) throw new Error("That server is no longer in Code Puppy's catalog.")
    if (template.entry.unavailable) throw new Error(`${template.entry.displayName}: ${template.entry.unavailable}.`)
    const values = completeValues(template.entry, typed)
    const [prefix] = toolPrefixes([template.name])
    try {
      await this.sources.catalog.check(toAcpSpec(template.spec, prefix, values, packageMirrors()))
    } catch (error) {
      throw new Error(`${template.entry.displayName} did not start, so it was not added. ${error instanceof Error ? error.message : ''}`.trim())
    }
    if (Object.keys(values).length) this.sources.vault.set(id, values)
    const server: StoredMcpServer = { id, name: template.name, displayName: template.entry.displayName, source: 'catalog', enabled: true, variables: Object.keys(values), ...template.spec }
    this.save([...this.servers, server])
    return this.state
  }

  remove(id: string): McpState {
    this.sources.vault.delete(id)
    this.save(this.servers.filter((server) => server.id !== id))
    return this.state
  }

  setEnabled(id: string, enabled: boolean): McpState {
    this.save(this.servers.map((server) => (server.id === id ? { ...server, enabled } : server)))
    return this.state
  }

  /** Is the saved sign-in still good? Never opens a browser. */
  async checkSignIn(): Promise<McpState> {
    this.remember(await this.sources.market.token())
    return this.state
  }

  async signIn(): Promise<McpState> {
    this.remember(await this.sources.market.signIn())
    return this.state
  }

  /** What a new (or reopened) chat gets. Never throws: a chat must start even when the marketplace cannot be reached. */
  async sessionServers(): Promise<McpServer[]> {
    const enabled = this.servers.filter((server) => server.enabled)
    if (!enabled.length) return []
    const token = enabled.some((server) => server.variables.includes(TOKEN_VARIABLE)) ? await this.freshToken() : null
    const valuesFor = (server: StoredMcpServer) => ({
      ...(server.source === 'catalog' ? this.sources.vault.get(server.id) : {}),
      ...(token ? { [TOKEN_VARIABLE]: token } : {}),
    })
    return toAcpServers(enabled, valuesFor, packageMirrors())
  }

  private has(id: string): boolean {
    return this.servers.some((server) => server.id === id)
  }

  private async freshToken(): Promise<string | null> {
    if (this.cached && this.cached.expiresAtMs - TOKEN_MARGIN_MS > this.now()) return this.cached.token
    try {
      this.remember(await this.sources.market.token())
    } catch {
      this.cached = null
    }
    return this.cached?.token ?? null
  }

  private remember({ token, expiresAt }: MarketplaceToken): void {
    // Unknown expiry: trust it for an hour, then look again.
    this.cached = token ? { token, expiresAtMs: expiresAt ? expiresAt * 1000 : this.now() + 3_600_000 } : null
    const signedIn = token !== null
    if (signedIn !== this.signedIn) {
      this.signedIn = signedIn
      this.emit('changed', this.state)
    }
  }

  private save(servers: StoredMcpServer[]): void {
    this.servers = servers
    writeJsonAtomic(this.path, servers)
    this.emit('changed', this.state)
  }
}
