import { randomUUID } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { basename, isAbsolute } from 'node:path'
import type { ConnectionDraft, ConnectionExpiry, ConnectionInfo } from '@shared/api'
import { parseEnv } from './envFile'
import { checkGithubKey, type FetchLike } from './githubKey'
import { readJson, writeJsonAtomic } from './jsonFile'
import { readToken } from './jwt'
import { allowedUrl } from './mcpSpec'

/**
 * The credentials Puppy's user depends on, and whether each still works: the
 * Walmart sign-in, the GitHub token of the GitHub server, and tokens the user
 * adds (an app's `.env` file, such as ProductWatch's login token). What goes to
 * the window is who a token is for and when it ends. Never the token.
 *
 * Tokens in the user's own files are only ever read, and only for that.
 */

export interface StoredConnection {
  id: string
  name: string
  file: string
  tokenVariable: string
  accountVariable: string
  expiry: ConnectionExpiry
  renewUrl: string
  renewSteps: string
}

export interface ConnectionSources {
  walmart(): Promise<{ signedIn: boolean; expiresAtMs: number | null; account: string | null }>
  /** The saved token of the GitHub server, or null when that server was not added. */
  githubKey(): string | null
}

const VARIABLE = /^[A-Za-z_][A-Za-z0-9_]*$/
const MAX_FILE_BYTES = 1_000_000
const MAX_STEPS = 2_000
const DAY_MS = 86_400_000
/** GitHub is asked at most this often: the list is read every time the window regains focus. */
const GITHUB_CACHE_MS = 60_000

const GITHUB_TOKENS_PAGE = 'https://github.com/settings/tokens'
const GITHUB_RENEWAL = {
  steps: `Create a new token at github.com/settings/tokens, then remove "GitHub API" from your servers above and add it again with the new token.`,
  url: GITHUB_TOKENS_PAGE,
  signIn: false,
}
const WALMART_RENEWAL = { steps: '', url: null, signIn: true }

type Reading = { ok: true; values: Record<string, string>; modifiedMs: number } | { ok: false }

function readEnvFile(file: string): Reading {
  try {
    const stat = statSync(file)
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return { ok: false }
    return { ok: true, values: parseEnv(readFileSync(file, 'utf8')), modifiedMs: stat.mtimeMs }
  } catch {
    return { ok: false }
  }
}

/** A draft from the window, checked: the connection it describes, or why not. */
export function toStoredConnection(draft: ConnectionDraft): Omit<StoredConnection, 'id'> {
  const name = String(draft.name ?? '').trim().slice(0, 60)
  if (!name) throw new Error('Give the connection a name.')
  const file = String(draft.file ?? '').trim()
  if (!file) throw new Error('Choose the file that holds the token.')
  if (!isAbsolute(file)) throw new Error('The file needs its full path.')
  const tokenVariable = String(draft.tokenVariable ?? '').trim()
  if (!VARIABLE.test(tokenVariable)) throw new Error('The token variable is the NAME in NAME=value, like PW_TOKEN.')
  const accountVariable = String(draft.accountVariable ?? '').trim()
  if (accountVariable && !VARIABLE.test(accountVariable)) throw new Error('The account variable is the NAME in NAME=value, like PW_EMAIL.')
  const renewUrl = String(draft.renewUrl ?? '').trim()
  if (renewUrl && !(renewUrl.startsWith('https://') && allowedUrl(renewUrl))) throw new Error('The renewal page must be an https:// address.')
  const renewSteps = String(draft.renewSteps ?? '').trim()
  if (renewSteps.length > MAX_STEPS) throw new Error(`The renewal steps are too long (${MAX_STEPS} characters at most).`)

  const reading = readEnvFile(file)
  if (!reading.ok) throw new Error(`Puppy cannot read ${basename(file)}.`)
  if (!reading.values[tokenVariable]) throw new Error(`${tokenVariable} is not in ${basename(file)}.`)

  const expiry = draft.expiry
  if (expiry?.kind === 'days' && !(Number.isInteger(expiry.days) && expiry.days >= 1 && expiry.days <= 365)) throw new Error('Days must be a whole number from 1 to 365.')
  if (!expiry || !['token', 'days', 'none'].includes(expiry.kind)) throw new Error('Say how the token expires.')
  return { name, file, tokenVariable, accountVariable, expiry: expiry.kind === 'days' ? { kind: 'days', days: expiry.days } : { kind: expiry.kind }, renewUrl, renewSteps }
}

function readStored(path: string): StoredConnection[] {
  const saved = readJson<unknown>(path, [])
  if (!Array.isArray(saved)) return []
  return saved.filter(
    (entry): entry is StoredConnection => !!entry && typeof entry === 'object' && typeof entry.id === 'string' && typeof entry.file === 'string' && VARIABLE.test(String(entry.tokenVariable)) && !!entry.expiry,
  )
}

function describeStored(connection: StoredConnection): ConnectionInfo {
  const file = basename(connection.file)
  const base = {
    id: connection.id,
    name: connection.name,
    removable: true,
    renew: connection.renewSteps || connection.renewUrl ? { steps: connection.renewSteps, url: connection.renewUrl || null, signIn: false } : null,
  }
  const reading = readEnvFile(connection.file)
  if (!reading.ok) return { ...base, state: 'disconnected', account: null, expiresAt: null, note: `Puppy cannot read ${file}.` }
  const token = reading.values[connection.tokenVariable]
  if (!token) return { ...base, state: 'disconnected', account: null, expiresAt: null, note: `${connection.tokenVariable} is not in ${file}.` }

  const claims = readToken(token)
  const account = ((connection.accountVariable && reading.values[connection.accountVariable]) || claims?.account || '').slice(0, 100) || null
  const { expiry } = connection
  if (expiry.kind === 'days') return { ...base, state: 'connected', account, expiresAt: reading.modifiedMs + expiry.days * DAY_MS, note: `Counted from when ${file} last changed.` }
  if (expiry.kind === 'none') return { ...base, state: 'connected', account, expiresAt: null, note: 'Does not expire.' }
  return { ...base, state: 'connected', account, expiresAt: claims?.expiresAtMs ?? null, note: claims?.expiresAtMs ? null : 'This token does not say when it ends.' }
}

export class ConnectionService {
  private stored: StoredConnection[]
  private github: { token: string; at: number; row: ConnectionInfo } | null = null

  constructor(
    private readonly path: string,
    private readonly sources: ConnectionSources,
    private readonly now: () => number = Date.now,
    private readonly fetcher?: FetchLike,
  ) {
    this.stored = readStored(path)
  }

  async list(): Promise<ConnectionInfo[]> {
    const [walmart, github] = await Promise.all([this.walmartRow(), this.githubRow()])
    return [walmart, ...(github ? [github] : []), ...this.stored.map(describeStored)]
  }

  async add(draft: ConnectionDraft): Promise<ConnectionInfo[]> {
    this.save([...this.stored, { id: `custom:${randomUUID().slice(0, 8)}`, ...toStoredConnection(draft) }])
    return this.list()
  }

  async remove(id: string): Promise<ConnectionInfo[]> {
    this.save(this.stored.filter((connection) => connection.id !== id))
    return this.list()
  }

  /** The page where a new token comes from, for the "Renew" button. Only ever a URL that was saved, or GitHub's. */
  renewalUrl(id: string): string | null {
    if (id === 'github') return GITHUB_TOKENS_PAGE
    return this.stored.find((connection) => connection.id === id)?.renewUrl || null
  }

  private async walmartRow(): Promise<ConnectionInfo> {
    const base = { id: 'walmart', name: 'Walmart sign-in', removable: false, renew: WALMART_RENEWAL }
    try {
      const { signedIn, expiresAtMs, account } = await this.sources.walmart()
      return signedIn
        ? { ...base, state: 'connected', account, expiresAt: expiresAtMs, note: 'Marketplace servers use this.' }
        : { ...base, state: 'disconnected', account: null, expiresAt: null, note: 'Marketplace servers wait until you sign in.' }
    } catch {
      return { ...base, state: 'unknown', account: null, expiresAt: null, note: 'Could not check the sign-in.' }
    }
  }

  private async githubRow(): Promise<ConnectionInfo | null> {
    const token = this.sources.githubKey()
    if (!token) {
      this.github = null
      return null
    }
    if (this.github?.token === token && this.now() - this.github.at < GITHUB_CACHE_MS) return this.github.row
    const base = { id: 'github', name: 'GitHub token', removable: false, renew: GITHUB_RENEWAL }
    const check = await checkGithubKey(token, this.fetcher)
    const row: ConnectionInfo =
      check.status === 'accepted'
        ? { ...base, state: 'connected', account: check.login, expiresAt: check.expiresAtMs, note: check.expiresAtMs === null ? 'This token does not expire.' : null }
        : check.status === 'rejected'
          ? { ...base, state: 'disconnected', account: null, expiresAt: null, note: 'GitHub rejected this token.' }
          : { ...base, state: 'unknown', account: null, expiresAt: null, note: 'Could not reach GitHub to check it.' }
    if (check.status !== 'unreachable') this.github = { token, at: this.now(), row }
    return row
  }

  private save(connections: StoredConnection[]): void {
    this.stored = connections
    writeJsonAtomic(this.path, connections)
  }
}
