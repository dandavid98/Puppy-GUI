import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ConnectionDraft } from '@shared/api'
import { describe, expect, it } from 'vitest'
import { ConnectionService, type ConnectionSources } from './connections'
import type { FetchLike } from './githubKey'

const NOW = Date.UTC(2026, 10, 27, 18, 0)
const DAY = 86_400_000
const jwt = (claims: object) => `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`
const GITHUB_TOKEN = 'ghp_0123456789abcdefghijklmnopqrstuvwxyz'

function setup(sources: Partial<ConnectionSources> = {}, fetcher?: FetchLike) {
  const dir = mkdtempSync(join(tmpdir(), 'puppy-conn-'))
  const paths = { store: join(dir, 'connections.json'), env: join(dir, '.env.local') }
  let now = NOW
  const full: ConnectionSources = {
    walmart: async () => ({ signedIn: true, expiresAtMs: NOW + 8 * 3_600_000, account: 'me@walmart.com' }),
    githubKey: () => null,
    ...sources,
  }
  const make = () => new ConnectionService(paths.store, full, () => now, fetcher)
  return { service: make(), make, paths, advance: (ms: number) => (now += ms), env: (text: string) => writeFileSync(paths.env, text) }
}

const draft = (file: string, overrides: Partial<ConnectionDraft> = {}): ConnectionDraft => ({
  name: 'ProductWatch',
  file,
  tokenVariable: 'PW_TOKEN',
  accountVariable: 'PW_EMAIL',
  expiry: { kind: 'token' },
  renewUrl: 'https://pw.example.com',
  renewSteps: '1. Sign in\n2. Run the script',
  ...overrides,
})

const answer = (status: number, body: unknown = {}, headers: Record<string, string> = {}): FetchLike => async () => ({ status, headers: { get: (name) => headers[name.toLowerCase()] ?? null }, json: async () => body })

describe('ConnectionService: built-in connections', () => {
  it('shows the Walmart sign-in with who and when, and says so when it is missing or cannot be checked', async () => {
    const [signedIn] = await setup().service.list()
    expect(signedIn).toMatchObject({ id: 'walmart', name: 'Walmart sign-in', state: 'connected', account: 'me@walmart.com', expiresAt: NOW + 8 * 3_600_000, removable: false, renew: { signIn: true } })
    const [out] = await setup({ walmart: async () => ({ signedIn: false, expiresAtMs: null, account: null }) }).service.list()
    expect(out).toMatchObject({ state: 'disconnected', expiresAt: null })
    const [broken] = await setup({ walmart: async () => Promise.reject(new Error('python gone')) }).service.list()
    expect(broken).toMatchObject({ state: 'unknown', note: 'Could not check the sign-in.' })
  })

  it('lists the GitHub token only once that server was added, with its owner and expiry', async () => {
    expect((await setup().service.list()).map((row) => row.id)).toEqual(['walmart'])
    const ok = answer(200, { login: 'dandavid98' }, { 'github-authentication-token-expiration': '2026-12-01 10:00:00 UTC' })
    const rows = await setup({ githubKey: () => GITHUB_TOKEN }, ok).service.list()
    expect(rows[1]).toMatchObject({ id: 'github', state: 'connected', account: 'dandavid98', expiresAt: Date.UTC(2026, 11, 1, 10), renew: { url: 'https://github.com/settings/tokens' } })
  })

  it('says when GitHub rejected the token or could not be reached, and does not remember an unreachable answer', async () => {
    const rejected = await setup({ githubKey: () => GITHUB_TOKEN }, answer(401)).service.list()
    expect(rejected[1]).toMatchObject({ state: 'disconnected', note: 'GitHub rejected this token.' })
    let reachable = false
    const flaky: FetchLike = (url, init) => (reachable ? answer(200, { login: 'dandavid98' })(url, init) : Promise.reject(new Error('offline')))
    const { service } = setup({ githubKey: () => GITHUB_TOKEN }, flaky)
    expect((await service.list())[1]).toMatchObject({ state: 'unknown' })
    reachable = true
    expect((await service.list())[1]).toMatchObject({ state: 'connected' })
  })

  it('asks GitHub at most once a minute, and again for a different token', async () => {
    let asked = 0
    let token = GITHUB_TOKEN
    const counting: FetchLike = (url, init) => (asked++, answer(200, { login: 'dandavid98' })(url, init))
    const { service, advance } = setup({ githubKey: () => token }, counting)
    await service.list()
    await service.list()
    expect(asked).toBe(1)
    advance(61_000)
    await service.list()
    expect(asked).toBe(2)
    token = 'ghp_replacedwithanewtokenabcdefghijklmnopq'
    await service.list()
    expect(asked).toBe(3)
  })
})

describe('ConnectionService: connections the user adds', () => {
  it("shows an app's login token: who, and when it ends according to the token itself", async () => {
    const { service, paths, env } = setup()
    const expires = Math.floor((NOW + 6 * DAY + 16 * 3_600_000) / 1000)
    env(`PW_BASE_URL="https://pw.example.com"\nPW_EMAIL="daniel@walmart.com"\nPW_TOKEN="${jwt({ exp: expires })}"\n`)
    const rows = await service.add(draft(paths.env))
    expect(rows[1]).toMatchObject({ name: 'ProductWatch', state: 'connected', account: 'daniel@walmart.com', expiresAt: expires * 1000, removable: true, note: null })
    expect(rows[1].renew).toEqual({ steps: '1. Sign in\n2. Run the script', url: 'https://pw.example.com', signIn: false })
  })

  it('never lets the token out: not into its own file, nor into anything sent to the window', async () => {
    const { service, paths, env } = setup()
    const token = jwt({ exp: Math.floor((NOW + DAY) / 1000), email: 'daniel@walmart.com' })
    env(`PW_TOKEN=${token}\n`)
    const rows = await service.add(draft(paths.env, { accountVariable: '' }))
    expect(JSON.stringify(rows)).not.toContain(token)
    expect(readFileSync(paths.store, 'utf8')).not.toContain(token)
    expect(rows[1].account).toBe('daniel@walmart.com') // from the token itself when no account variable is named
  })

  it('notices a renewed token the next time it looks, without being told', async () => {
    const { service, paths, env } = setup()
    env(`PW_TOKEN=${jwt({ exp: Math.floor((NOW - DAY) / 1000) })}\n`)
    await service.add(draft(paths.env))
    expect((await service.list())[1].expiresAt).toBe(NOW - DAY) // expired yesterday
    env(`PW_TOKEN=${jwt({ exp: Math.floor((NOW + 7 * DAY) / 1000) })}\n`) // set-pw-token.command ran
    expect((await service.list())[1].expiresAt).toBe(NOW + 7 * DAY)
  })

  it('counts a fixed lifetime from when the file last changed, and also handles tokens that never end', async () => {
    const { service, paths, env } = setup()
    env('API_KEY=plain-key\n')
    const changed = new Date(NOW - 2 * DAY)
    utimesSync(paths.env, changed, changed)
    const days = await service.add(draft(paths.env, { tokenVariable: 'API_KEY', accountVariable: '', expiry: { kind: 'days', days: 7 } }))
    expect(days[1].expiresAt).toBe(NOW - 2 * DAY + 7 * DAY)
    const none = await service.add(draft(paths.env, { name: 'Forever', tokenVariable: 'API_KEY', accountVariable: '', expiry: { kind: 'none' } }))
    expect(none[2]).toMatchObject({ expiresAt: null, note: 'Does not expire.' })
    const unreadable = await service.add(draft(paths.env, { name: 'Odd', tokenVariable: 'API_KEY', accountVariable: '' }))
    expect(unreadable[3]).toMatchObject({ state: 'connected', expiresAt: null, note: 'This token does not say when it ends.' })
  })

  it('shows a connection as not connected when its file or variable has gone', async () => {
    const { service, paths, env } = setup()
    env('PW_TOKEN=abc.def.ghi\n')
    await service.add(draft(paths.env))
    env('SOMETHING_ELSE=1\n')
    expect((await service.list())[1]).toMatchObject({ state: 'disconnected', note: 'PW_TOKEN is not in .env.local.' })
    rmSync(paths.env)
    expect((await service.list())[1]).toMatchObject({ state: 'disconnected', note: 'Puppy cannot read .env.local.' })
  })

  it('keeps connections across restarts, removes them, and ignores junk in a hand-edited file', async () => {
    const { service, make, paths, env } = setup()
    env(`PW_TOKEN=${jwt({ exp: 1 })}\n`)
    await service.add(draft(paths.env))
    expect((await make().list()).map((row) => row.name)).toEqual(['Walmart sign-in', 'ProductWatch'])
    const id = (await service.list())[1].id
    expect((await service.remove(id)).map((row) => row.id)).toEqual(['walmart'])
    writeFileSync(paths.store, JSON.stringify([null, { id: 'x' }, 'text', { id: 'y', file: '/f', tokenVariable: 'not valid!', expiry: { kind: 'none' } }]))
    expect((await make().list()).map((row) => row.id)).toEqual(['walmart'])
  })

  it('opens only the renewal page that was saved for that connection', async () => {
    const { service, paths, env } = setup()
    env('PW_TOKEN=x\n')
    const id = (await service.add(draft(paths.env)))[1].id
    expect(service.renewalUrl(id)).toBe('https://pw.example.com')
    expect(service.renewalUrl('github')).toBe('https://github.com/settings/tokens')
    expect(service.renewalUrl('walmart')).toBeNull()
    expect(service.renewalUrl('custom:nope')).toBeNull()
  })
})

describe('ConnectionService: checking what the user typed', () => {
  const rejects = async (change: Partial<ConnectionDraft> | ((file: string) => Partial<ConnectionDraft>), message: string | RegExp, contents = 'PW_TOKEN=abc\n') => {
    const { service, paths, env } = setup()
    env(contents)
    const overrides = typeof change === 'function' ? change(paths.env) : change
    await expect(service.add(draft(paths.env, overrides))).rejects.toThrow(message)
    expect(await service.list()).toHaveLength(1) // nothing was saved
  }

  it('asks for what is missing, and names the problem', async () => {
    await rejects({ name: '  ' }, 'Give the connection a name.')
    await rejects({ file: '' }, 'Choose the file that holds the token.')
    await rejects({ file: 'relative/.env' }, 'The file needs its full path.')
    await rejects((file) => ({ file: `${file}.missing` }), 'Puppy cannot read .env.local.missing.')
    await rejects({ tokenVariable: 'NOT A NAME' }, /NAME in NAME=value/)
    await rejects({ accountVariable: '1bad' }, /account variable/)
    await rejects({ tokenVariable: 'OTHER' }, 'OTHER is not in .env.local.')
  })

  it('refuses a renewal page that is not https, an expiry it cannot use, and a runaway instruction text', async () => {
    await rejects({ renewUrl: 'http://pw.example.com' }, 'The renewal page must be an https:// address.')
    await rejects({ renewUrl: 'javascript:alert(1)' }, 'The renewal page must be an https:// address.')
    await rejects({ expiry: { kind: 'days', days: 0 } }, 'Days must be a whole number from 1 to 365.')
    await rejects({ expiry: { kind: 'days', days: 1.5 } }, 'Days must be a whole number from 1 to 365.')
    await rejects({ renewSteps: 'x'.repeat(2_001) }, /too long/)
  })
})
