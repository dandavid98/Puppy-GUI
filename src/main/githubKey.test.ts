import { describe, expect, it } from 'vitest'
import { checkGithubKey, parseGithubExpiry, type FetchLike } from './githubKey'

const answer = (status: number, body: unknown = {}, headers: Record<string, string> = {}): FetchLike => async () => ({
  status,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  json: async () => body,
})

describe('parseGithubExpiry', () => {
  it('reads the UTC and offset spellings, and nothing else', () => {
    expect(parseGithubExpiry('2026-12-01 10:00:00 UTC')).toBe(Date.UTC(2026, 11, 1, 10))
    expect(parseGithubExpiry('2026-12-01 10:00:00 -0500')).toBe(Date.UTC(2026, 11, 1, 15))
    expect(parseGithubExpiry('tomorrow')).toBeNull()
    expect(parseGithubExpiry(null)).toBeNull()
  })
})

describe('checkGithubKey', () => {
  it('names the owner and the expiry of an accepted token (none for one that never expires)', async () => {
    const withExpiry = answer(200, { login: 'dandavid98' }, { 'github-authentication-token-expiration': '2026-12-01 10:00:00 UTC' })
    expect(await checkGithubKey('t', withExpiry)).toEqual({ status: 'accepted', login: 'dandavid98', expiresAtMs: Date.UTC(2026, 11, 1, 10) })
    expect(await checkGithubKey('t', answer(200, { login: 'dandavid98' }))).toEqual({ status: 'accepted', login: 'dandavid98', expiresAtMs: null })
  })

  it('tells a rejected token from GitHub being out of reach', async () => {
    expect(await checkGithubKey('t', answer(401))).toEqual({ status: 'rejected' })
    expect(await checkGithubKey('t', answer(500))).toEqual({ status: 'unreachable' })
    expect(await checkGithubKey('t', answer(200, { nonsense: true }))).toEqual({ status: 'unreachable' })
    const offline: FetchLike = async () => {
      throw new Error('ENOTFOUND')
    }
    expect(await checkGithubKey('t', offline)).toEqual({ status: 'unreachable' })
  })

  it('sends the token only to api.github.com, as a header', async () => {
    let seen: { url: string; auth: string } | null = null
    const spy: FetchLike = async (url, init) => {
      seen = { url, auth: init.headers.Authorization }
      return answer(401)(url, init)
    }
    await checkGithubKey('secret-token', spy)
    expect(seen).toEqual({ url: 'https://api.github.com/user', auth: 'Bearer secret-token' })
  })
})
