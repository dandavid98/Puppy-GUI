import { EventEmitter } from 'node:events'
import type { McpServer } from '@agentclientprotocol/sdk'
import type { McpListing, McpState } from '@shared/api'
import { readJson, writeJsonAtomic } from './jsonFile'
import type { Marketplace, MarketplaceToken, McpServerConfig } from './mcpMarketplace'

/**
 * The MCP servers the user added to Puppy, kept in Puppy's own data folder
 * (never in code-puppy's mcp_servers.json, so the terminal is unaffected), and
 * handed to Code Puppy per chat through ACP when a session starts.
 *
 * Marketplace servers authenticate with the user's PingFed token. code-puppy
 * fills in `$PUPPY_MARKETPLACE_TOKEN` only for servers in its own registry, so
 * for ours the value is filled in here, in memory, at the moment a session
 * starts. It is never written to disk and never sent to the window.
 */

export interface StoredMcpServer extends McpServerConfig {
  enabled: boolean
}

const TOKEN_VARIABLE = /\$\{?PUPPY_MARKETPLACE_TOKEN\}?/g
const usesToken = (server: StoredMcpServer) => Object.values(server.headers).some((value) => new RegExp(TOKEN_VARIABLE.source).test(value))
/** A token this close to expiring is read again rather than handed to a new chat. */
const TOKEN_MARGIN_MS = 5 * 60_000
/** Long enough for a server's tools to be told apart, short enough that "prefix_tool" stays within models' 64-character limit. */
const MAX_PREFIX = 16

/** HTTPS, or plain HTTP on this Mac (local development servers). */
export function allowedUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'https:' || (protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(hostname))
  } catch {
    return false
  }
}

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

/** ACP specs for the enabled servers. Without a token, servers that need one are left out rather than sent to fail. */
export function toAcpServers(servers: StoredMcpServer[], token: string | null): McpServer[] {
  const usable = servers.filter((server) => server.enabled && (token !== null || !usesToken(server)))
  const prefixes = toolPrefixes(usable.map((server) => server.name))
  return usable.map((server, index) => ({
    type: server.type,
    name: prefixes[index],
    url: server.url,
    headers: Object.entries(server.headers).map(([name, value]) => ({ name, value: token === null ? value : value.replace(TOKEN_VARIABLE, token) })),
  }))
}

function readServers(path: string): StoredMcpServer[] {
  const saved = readJson<unknown>(path, [])
  if (!Array.isArray(saved)) return []
  return saved.filter(
    (server): server is StoredMcpServer =>
      !!server && typeof server === 'object' && typeof server.id === 'string' && typeof server.name === 'string' && typeof server.url === 'string' && allowedUrl(server.url),
  ).map((server) => ({ ...server, displayName: server.displayName || server.id, type: server.type === 'sse' ? 'sse' : 'http', headers: server.headers ?? {}, enabled: server.enabled !== false }))
}

export class McpService extends EventEmitter<{ changed: [McpState] }> {
  private servers: StoredMcpServer[]
  private signedIn: boolean | null = null
  private cached: { token: string; expiresAtMs: number } | null = null
  private listings: Promise<McpListing[]> | null = null

  constructor(
    private readonly path: string,
    private readonly market: Marketplace,
    private readonly now: () => number = Date.now,
  ) {
    super()
    this.servers = readServers(path)
  }

  get state(): McpState {
    return { servers: this.servers.map(({ id, displayName, enabled }) => ({ id, displayName, enabled })), signedIn: this.signedIn }
  }

  /** The marketplace catalog, read once per run (code-puppy caches it on disk too). A failure is retried next time. */
  marketplace(): Promise<McpListing[]> {
    this.listings ??= this.market.list().catch((error: unknown) => {
      this.listings = null
      throw error
    })
    return this.listings
  }

  async add(id: string): Promise<McpState> {
    if (!this.servers.some((server) => server.id === id)) {
      const config = await this.market.config(id)
      if (!config) throw new Error('That server is no longer in the marketplace.')
      this.save([...this.servers, { ...config, enabled: true }])
    }
    return this.state
  }

  remove(id: string): McpState {
    this.save(this.servers.filter((server) => server.id !== id))
    return this.state
  }

  setEnabled(id: string, enabled: boolean): McpState {
    this.save(this.servers.map((server) => (server.id === id ? { ...server, enabled } : server)))
    return this.state
  }

  /** Is the saved sign-in still good? Never opens a browser. */
  async checkSignIn(): Promise<McpState> {
    this.remember(await this.market.token())
    return this.state
  }

  async signIn(): Promise<McpState> {
    this.remember(await this.market.signIn())
    return this.state
  }

  /** What a new (or reopened) chat gets. Never throws: a chat must start even when the marketplace cannot be reached. */
  async sessionServers(): Promise<McpServer[]> {
    const enabled = this.servers.filter((server) => server.enabled)
    if (!enabled.length) return []
    const token = enabled.some(usesToken) ? await this.freshToken() : null
    return toAcpServers(enabled, token)
  }

  private async freshToken(): Promise<string | null> {
    if (this.cached && this.cached.expiresAtMs - TOKEN_MARGIN_MS > this.now()) return this.cached.token
    try {
      this.remember(await this.market.token())
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
