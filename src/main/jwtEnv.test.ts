import { describe, expect, it } from 'vitest'
import { parseEnv } from './envFile'
import { readToken } from './jwt'

const jwt = (claims: object) => `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`

describe('readToken', () => {
  it('reads the expiry and whose it is', () => {
    expect(readToken(jwt({ exp: 1_800_000_000, email: 'a@walmart.com', sub: 'x' }))).toEqual({ expiresAtMs: 1_800_000_000_000, account: 'a@walmart.com' })
    expect(readToken(jwt({ sub: 'b@walmart.com' }))).toEqual({ expiresAtMs: null, account: 'b@walmart.com' }) // an email-shaped subject
    expect(readToken(jwt({ exp: 'soon', sub: 'a-guid' }))).toEqual({ expiresAtMs: null, account: null })
  })

  it('is null for anything that is not a JWT', () => {
    for (const text of ['ghp_abcdefghijklmnopqrstuvwxyz0123456789', '', 'a.b.c', 'only.two']) expect(readToken(text)).toBeNull()
  })
})

describe('parseEnv', () => {
  it('reads plain, exported and quoted values, skips comments, and lets the last repeat win', () => {
    const text = ['# a comment', 'PW_BASE_URL="https://pw.example.com"', "export PW_EMAIL='me@walmart.com'", 'PLAIN=value # note', 'EMPTY=', 'not a line', 'PLAIN=final', 'WIN=\r'].join('\r\n')
    expect(parseEnv(text)).toEqual({ PW_BASE_URL: 'https://pw.example.com', PW_EMAIL: 'me@walmart.com', PLAIN: 'final', EMPTY: '', WIN: '' })
  })

  it('keeps a # inside quotes and an = inside a value', () => {
    expect(parseEnv('A="x # y"\nB=k=v==')).toEqual({ A: 'x # y', B: 'k=v==' })
  })
})
