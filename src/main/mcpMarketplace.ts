import type { McpListing } from '@shared/api'
import { runPython, runScript, type Runner } from './codePuppyPython'
import { allowedUrl } from './mcpServers'

/**
 * Walmart's MCP marketplace, through code-puppy's own plugin: its catalog
 * (cached by code-puppy), its install step (which resolves each server's
 * routing headers), and its PingFed sign-in. Nothing here writes code-puppy's
 * MCP configuration: the servers the user adds are Puppy's alone.
 */

/** A server as added to Puppy. `headers` keep code-puppy's `$PUPPY_MARKETPLACE_TOKEN` placeholder, never a token. */
export interface McpServerConfig {
  id: string
  name: string
  displayName: string
  type: 'http' | 'sse'
  url: string
  headers: Record<string, string>
}

export interface MarketplaceToken {
  token: string | null
  /** Seconds since the epoch; null when unknown. */
  expiresAt: number | null
}

export interface Marketplace {
  list(): Promise<McpListing[]>
  /** What code-puppy's own installer would save for this server; null if the marketplace no longer lists it. */
  config(id: string): Promise<McpServerConfig | null>
  /** The saved sign-in, if it is still valid. Never opens a browser. */
  token(): Promise<MarketplaceToken>
  /** Walmart SSO in Chrome (closes by itself when already signed in), then the token. */
  signIn(): Promise<MarketplaceToken>
}

const TEMPLATES = `
from code_puppy.plugins.walmart_mcp_marketplace.client import fetch_marketplace
from code_puppy.plugins.walmart_mcp_marketplace.templates import build_templates
templates = build_templates(fetch_marketplace())
`

const LIST_SCRIPT = `${TEMPLATES}
emit([
    {"id": t.id, "displayName": t.display_name, "description": t.description or "",
     "tags": list(t.tags or []), "author": t.author or "", "verified": bool(t.verified)}
    for t in templates
])
`

const CONFIG_SCRIPT = `${TEMPLATES}
match = next((t for t in templates if t.id == sys.argv[1]), None)
config = match.to_server_config() if match else None  # resolves routing headers, exactly as /mcp install does
emit(config and {"id": match.id, "name": config.get("name"), "displayName": match.display_name,
                 "type": config.get("type"), "url": config.get("url"), "headers": config.get("headers") or {}})
`

/** Valid until the JWT expires, or code-puppy's own age cap on the token file, whichever is first. */
const TOKEN_SCRIPT = `
import base64
token, expires = None, None
try:
    from code_puppy.config import get_value
    from code_puppy.plugins.walmart_mcp_marketplace import auth_guard
    if auth_guard._marketplace_token_is_valid():
        token = get_value("marketplace_token")
        part = token.split(".")[1]
        expires = json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))).get("exp")
        cap = auth_guard._TOKEN_FILE_PATH.stat().st_mtime + auth_guard._MAX_TOKEN_AGE_SECONDS
        expires = min(expires, cap) if expires else cap
except Exception:
    pass
emit({"token": token, "expiresAt": expires})
`

const SIGN_IN_SCRIPT = `
try:
    from code_puppy.plugins.walmart_mcp_marketplace.auth_guard import _silence_pingfed_emits
    from code_puppy.plugins.walmart_specific.pingfed_auth import handle_puppy_auth_command
    with _silence_pingfed_emits():
        handle_puppy_auth_command("/marketplace_auth", "marketplace_auth")
except Exception:
    pass
${TOKEN_SCRIPT}`

/** code-puppy gives the user three minutes to finish signing in. */
const SIGN_IN_TIMEOUT_MS = 200_000

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

export function toListings(emitted: unknown): McpListing[] {
  if (!Array.isArray(emitted)) throw new Error('Could not read the MCP marketplace.')
  return emitted
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object' && typeof entry.id === 'string')
    .map((entry) => ({
      id: text(entry.id),
      displayName: text(entry.displayName) || text(entry.id),
      description: text(entry.description),
      tags: Array.isArray(entry.tags) ? entry.tags.filter((tag): tag is string => typeof tag === 'string') : [],
      author: text(entry.author),
      verified: entry.verified === true,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
}

/** A JWT in a header value means a real token, which must never be saved. */
const LOOKS_LIKE_TOKEN = /eyJ[\w-]{10,}\.[\w-]{10,}/

export function toConfig(emitted: unknown): McpServerConfig | null {
  if (!emitted || typeof emitted !== 'object') return null
  const raw = emitted as Record<string, unknown>
  if (typeof raw.id !== 'string' || typeof raw.url !== 'string' || !allowedUrl(raw.url)) return null
  const headers = Object.fromEntries(
    Object.entries(raw.headers && typeof raw.headers === 'object' ? raw.headers : {}).map(([name, value]) => [name, String(value)]),
  )
  if (Object.values(headers).some((value) => LOOKS_LIKE_TOKEN.test(value))) throw new Error('Refusing to save a server whose settings include a token.')
  return {
    id: raw.id,
    name: text(raw.name) || raw.id,
    displayName: text(raw.displayName) || raw.id,
    type: raw.type === 'sse' ? 'sse' : 'http',
    url: raw.url,
    headers,
  }
}

export function toToken(emitted: unknown): MarketplaceToken {
  const raw = (emitted ?? {}) as { token?: unknown; expiresAt?: unknown }
  return {
    token: typeof raw.token === 'string' && raw.token ? raw.token : null,
    expiresAt: typeof raw.expiresAt === 'number' && Number.isFinite(raw.expiresAt) ? raw.expiresAt : null,
  }
}

export class CodePuppyMarketplace implements Marketplace {
  constructor(
    private readonly python: () => string | null,
    private readonly run: Runner = runPython,
  ) {}

  private interpreter(): string {
    const python = this.python()
    if (!python) throw new Error('Code Puppy is not installed where Puppy can find it.')
    return python
  }

  async list(): Promise<McpListing[]> {
    return toListings(await runScript(this.interpreter(), LIST_SCRIPT, {}, this.run))
  }

  async config(id: string): Promise<McpServerConfig | null> {
    return toConfig(await runScript(this.interpreter(), CONFIG_SCRIPT, { args: [id] }, this.run))
  }

  async token(): Promise<MarketplaceToken> {
    return toToken(await runScript(this.interpreter(), TOKEN_SCRIPT, { network: false }, this.run))
  }

  async signIn(): Promise<MarketplaceToken> {
    return toToken(await runScript(this.interpreter(), SIGN_IN_SCRIPT, { timeoutMs: SIGN_IN_TIMEOUT_MS }, this.run))
  }
}
