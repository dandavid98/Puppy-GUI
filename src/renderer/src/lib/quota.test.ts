import type { QuotaSnapshot } from '@shared/api'
import { describe, expect, it } from 'vitest'
import { describeModelQuota, formatReset, quotaForModel, quotaSummary, secondsUntilReset } from './quota'

// The numbers from a real maxed-out account: large 100%+, standard 74%.
const maxedLarge: QuotaSnapshot = {
  fetchedAt: 1_000_000,
  standard: { used: 42_481_805, limit: 57_368_982 },
  large: { used: 25_025_112, limit: 25_000_000 },
  requests: { used: 349, limit: 1250 },
  resetsInSecs: 5390,
  burnRates: { 'claude-opus-5-5': 1, 'gpt-5.5': 1, 'claude-sonnet-5-5': 0.7, 'gemini-3.8-flash': 0.25, 'gpt-6-luna': 0 },
}

describe('quotaForModel', () => {
  it('shows a large model as full when the large quota is spent (the bug: this used to read 0%)', () => {
    expect(quotaForModel(maxedLarge, 'claude-opus-5-5')).toMatchObject({ kind: 'metered', bucket: 'large', percent: 100 })
    expect(quotaForModel(maxedLarge, 'gpt-5.5')).toMatchObject({ bucket: 'large', percent: 100 })
  })

  it('shows other models against the standard quota', () => {
    expect(quotaForModel(maxedLarge, 'claude-sonnet-5-5')).toMatchObject({ bucket: 'standard', percent: 74 })
    expect(quotaForModel(maxedLarge, 'gemini-3.8-flash')).toMatchObject({ bucket: 'standard', percent: 74 })
  })

  it('calls zero-burn models free, whatever the buckets say', () => {
    expect(quotaForModel(maxedLarge, 'gpt-6-luna')).toEqual({ kind: 'free' })
  })

  it('says nothing about a model whose cost it does not know, rather than guessing', () => {
    expect(quotaForModel(maxedLarge, 'my-own-model')).toBeNull()
    expect(quotaForModel({ ...maxedLarge, burnRates: {} }, 'claude-opus-5-5')).toBeNull()
  })

  it('treats the large quota as spent once the standard quota it is carved from is spent', () => {
    const standardGone = { ...maxedLarge, standard: { used: 60_000_000, limit: 57_368_982 }, large: { used: 1_000_000, limit: 25_000_000 } }
    expect(quotaForModel(standardGone, 'claude-opus-5-5')).toMatchObject({ percent: 100, blockedByStandard: true })
    expect(quotaForModel(standardGone, 'claude-sonnet-5-5')).toMatchObject({ bucket: 'standard', percent: 100 })
  })

  it('reads a partly used large quota honestly', () => {
    const half = { ...maxedLarge, large: { used: 12_500_000, limit: 25_000_000 } }
    expect(quotaForModel(half, 'claude-opus-5-5')).toMatchObject({ bucket: 'large', percent: 50 })
  })

  it('has no ring for a bucket without a limit (unlimited)', () => {
    expect(quotaForModel({ ...maxedLarge, large: { used: 5, limit: 0 } }, 'claude-opus-5-5')).toBeNull()
    expect(quotaForModel({ ...maxedLarge, standard: { used: 5, limit: 0 } }, 'claude-sonnet-5-5')).toBeNull()
  })
})

describe('reset countdown', () => {
  it('counts down from when the numbers were read', () => {
    expect(secondsUntilReset(maxedLarge, 1_000_000)).toBe(5390)
    expect(secondsUntilReset(maxedLarge, 1_000_000 + 90_000)).toBe(5300)
    expect(secondsUntilReset(maxedLarge, 1_000_000 + 99_999_999)).toBe(0)
  })

  it('formats in plain words', () => {
    expect(formatReset(5390)).toBe('1h 29m')
    expect(formatReset(7200)).toBe('2h')
    expect(formatReset(600)).toBe('10m')
    expect(formatReset(30)).toBe('under a minute')
    expect(formatReset(0)).toBe('under a minute')
  })
})

describe('wording', () => {
  it('explains each ring in a sentence', () => {
    const opus = quotaForModel(maxedLarge, 'claude-opus-5-5')!
    expect(describeModelQuota('claude-opus-5-5', opus, '1h 29m')).toBe('claude-opus-5-5: 100% of your large-model quota used (25M of 25M). Resets in 1h 29m.')
    expect(describeModelQuota('gpt-6-luna', { kind: 'free' }, '1h')).toBe('gpt-6-luna: free, it does not use your quota.')
    const blocked = quotaForModel({ ...maxedLarge, standard: { used: 9, limit: 5 } }, 'claude-opus-5-5')!
    expect(describeModelQuota('claude-opus-5-5', blocked, '10m')).toContain('standard quota is used up')
  })

  it('summarises both buckets and the reset time', () => {
    expect(quotaSummary(maxedLarge, 1_000_000)).toBe('Large 100% · Others 74% · resets in 1h 29m')
    expect(quotaSummary({ ...maxedLarge, large: { used: 0, limit: 0 } }, 1_000_000)).toBe('Others 74% · resets in 1h 29m')
  })
})
