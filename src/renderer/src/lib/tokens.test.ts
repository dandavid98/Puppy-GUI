import { describe, expect, it } from 'vitest'
import { formatTokens, percentOf } from './tokens'

describe('formatTokens', () => {
  it('abbreviates thousands and millions without noise', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(950)).toBe('950')
    expect(formatTokens(1_234)).toBe('1.2k')
    expect(formatTokens(18_432)).toBe('18k')
    expect(formatTokens(272_000)).toBe('272k')
    expect(formatTokens(1_000_000)).toBe('1M')
    expect(formatTokens(2_500_000)).toBe('2.5M')
  })
})

describe('percentOf', () => {
  it('rounds to whole percents', () => {
    expect(percentOf(50, 200)).toBe(25)
    expect(percentOf(19_090, 272_000)).toBe(7)
  })

  it('shows at least 1% for any real use, and 0 for none', () => {
    expect(percentOf(3, 5_000_000)).toBe(1)
    expect(percentOf(0, 5_000_000)).toBe(0)
  })

  it('caps at 100 and survives a missing or zero total', () => {
    expect(percentOf(9_999_999, 5_000_000)).toBe(100)
    expect(percentOf(10, 0)).toBe(0)
    expect(percentOf(10, Number.NaN)).toBe(0)
  })
})
