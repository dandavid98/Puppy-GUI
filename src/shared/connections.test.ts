import { describe, expect, it } from 'vitest'
import { connectionHealth, formatRemaining, guessVariables, SOON_MS } from './connections'

const HOUR = 3_600_000
const NOW = 1_000_000_000_000

describe('connectionHealth', () => {
  it('is ok until the last day, then soon, then expired', () => {
    const at = (expiresAt: number | null) => connectionHealth({ state: 'connected', expiresAt }, NOW)
    expect(at(NOW + 7 * 24 * HOUR)).toBe('ok')
    expect(at(NOW + SOON_MS + 1)).toBe('ok')
    expect(at(NOW + SOON_MS - 1)).toBe('soon')
    expect(at(NOW + 1)).toBe('soon')
    expect(at(NOW)).toBe('expired')
    expect(at(NOW - HOUR)).toBe('expired')
  })

  it('is ok without an expiry, and says so when nothing is connected or it could not be checked', () => {
    expect(connectionHealth({ state: 'connected', expiresAt: null }, NOW)).toBe('ok')
    expect(connectionHealth({ state: 'disconnected', expiresAt: NOW + HOUR }, NOW)).toBe('off')
    expect(connectionHealth({ state: 'unknown', expiresAt: null }, NOW)).toBe('unknown')
  })
})

describe('guessVariables', () => {
  const vars = (...names: string[]) => names.map((name) => ({ name, selfExpiring: name.startsWith('JWT') }))

  it('picks the token and the account by name, so the user mostly just confirms', () => {
    expect(guessVariables(vars('PW_BASE_URL', 'PW_EMAIL', 'PW_TOKEN'))).toEqual({ token: 'PW_TOKEN', account: 'PW_EMAIL' })
    expect(guessVariables(vars('STRIPE_API_KEY', 'ACCOUNT_ID'))).toEqual({ token: 'STRIPE_API_KEY', account: 'ACCOUNT_ID' })
    expect(guessVariables(vars('DB_PASSWORD', 'DB_USERNAME'))).toEqual({ token: 'DB_PASSWORD', account: 'DB_USERNAME' })
  })

  it('prefers a login token that names its own expiry, and never offers the token as the account', () => {
    expect(guessVariables(vars('API_KEY', 'JWT_LOGIN', 'USER_EMAIL')).token).toBe('JWT_LOGIN')
    expect(guessVariables(vars('USER_TOKEN')).account).toBe('')
  })

  it('leaves both empty when nothing looks right', () => {
    expect(guessVariables(vars('PORT', 'HOST'))).toEqual({ token: '', account: '' })
    expect(guessVariables([])).toEqual({ token: '', account: '' })
  })
})

describe('formatRemaining', () => {
  it('keeps the two biggest units', () => {
    expect(formatRemaining(6 * 24 * HOUR + 16 * HOUR + 59_000)).toBe('6d 16h')
    expect(formatRemaining(2 * 24 * HOUR)).toBe('2d')
    expect(formatRemaining(5 * HOUR + 12 * 60_000)).toBe('5h 12m')
    expect(formatRemaining(HOUR)).toBe('1h')
    expect(formatRemaining(8 * 60_000 + 30_000)).toBe('8m')
    expect(formatRemaining(30_000)).toBe('under a minute')
  })
})
