import { describe, expect, it } from 'vitest'
import { SENTINEL, type Runner } from './codePuppyPython'
import { CodePuppyMarketplace, toConfig, toListings, toToken } from './mcpMarketplace'

describe('toListings', () => {
  it('keeps entries with an id, sorted by name, with clean tags', () => {
    expect(
      toListings([
        { id: 'z', displayName: 'Zeta', description: 'last', tags: ['ai', 3], author: 'me', verified: true },
        { id: 'a', tags: null },
        { displayName: 'no id' },
      ]),
    ).toEqual([
      { id: 'a', displayName: 'a', description: '', tags: [], author: '', verified: false },
      { id: 'z', displayName: 'Zeta', description: 'last', tags: ['ai'], author: 'me', verified: true },
    ])
  })

  it('throws when the marketplace could not be read', () => {
    expect(() => toListings(null)).toThrow(/marketplace/)
  })
})

describe('toConfig', () => {
  const good = { id: 'a', name: 'a-mcp', displayName: 'A', type: 'http', url: 'https://a.walmart.com/mcp', headers: { Authorization: 'Bearer $PUPPY_MARKETPLACE_TOKEN', 'WM_SVC.ENV': 'prod' } }

  it('keeps the placeholder headers as they are', () => {
    expect(toConfig(good)).toEqual({ ...good, type: 'http' })
  })

  it('rejects unusable or unsafe configs', () => {
    expect(toConfig(null)).toBeNull()
    expect(toConfig({ ...good, url: 'http://a.walmart.com/mcp' })).toBeNull()
  })

  it('refuses to save anything that already contains a real token', () => {
    expect(() => toConfig({ ...good, headers: { Authorization: 'Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJtZSJ9.sig' } })).toThrow(/token/)
  })
})

describe('toToken', () => {
  it('reads a token and its expiry, or nothing', () => {
    expect(toToken({ token: 't', expiresAt: 123 })).toEqual({ token: 't', expiresAt: 123 })
    expect(toToken({ token: '', expiresAt: 'soon' })).toEqual({ token: null, expiresAt: null })
    expect(toToken(null)).toEqual({ token: null, expiresAt: null })
  })
})

describe('CodePuppyMarketplace', () => {
  const recording = () => {
    const calls: { script: string; args: string[]; timeout?: number }[] = []
    const run: Runner = async (_python, args, timeout) => {
      calls.push({ script: args[1], args: args.slice(2), timeout })
      return `${SENTINEL}{"token": null, "expiresAt": null}`
    }
    return { calls, market: new CodePuppyMarketplace(() => 'py', run) }
  }

  it('checks the token offline and without ever starting a sign-in', async () => {
    const { calls, market } = recording()
    await market.token()
    expect(calls[0].script).not.toContain('run_doctor')
    expect(calls[0].script).not.toContain('marketplace_auth')
  })

  it('signs in through code-puppy\'s own command, quietly, with time to finish SSO', async () => {
    const { calls, market } = recording()
    await market.signIn()
    expect(calls[0].script).toContain('handle_puppy_auth_command("/marketplace_auth"')
    expect(calls[0].script).toContain('_silence_pingfed_emits') // its messages print the start of the token
    expect(calls[0].timeout).toBeGreaterThanOrEqual(180_000)
  })

  it('passes the server id as an argument, and installs it the way /mcp install does', async () => {
    const { calls, market } = recording()
    await market.config('wmt-accelerator-mcp')
    expect(calls[0].args).toEqual(['wmt-accelerator-mcp'])
    expect(calls[0].script).toContain('to_server_config()')
  })
})
