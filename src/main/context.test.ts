import { describe, expect, it } from 'vitest'
import { estimateContext, readTurnUsage } from './context'

const base = { previous: null, toolCalls: 0, contextLength: 200_000 }

describe('estimateContext', () => {
  it('is exact when the turn made a single request', () => {
    expect(estimateContext({ ...base, inputTokens: 19_031, outputTokens: 59 })).toBe(19_090)
  })

  it('recovers the last request from totals summed over several, given the starting size', () => {
    // three requests carrying 10k, 12k, 14k: input sums to 36k, the real context ends at 14k + 500 output
    expect(estimateContext({ ...base, previous: 10_000, toolCalls: 2, inputTokens: 36_000, outputTokens: 500 })).toBe(14_500)
  })

  it('falls back to the per-request average when the starting size is unknown', () => {
    expect(estimateContext({ ...base, toolCalls: 2, inputTokens: 36_000, outputTokens: 0 })).toBe(12_000)
  })

  it('never returns more than the totals allow, even with a stale starting size', () => {
    const used = estimateContext({ ...base, previous: 1_000, toolCalls: 1, inputTokens: 20_000, outputTokens: 0 })
    expect(used).toBeLessThanOrEqual(20_000)
    expect(used).toBeGreaterThanOrEqual(10_000)
  })

  it('caps at the context window', () => {
    expect(estimateContext({ ...base, contextLength: 8_000, inputTokens: 50_000, outputTokens: 0 })).toBe(8_000)
  })
})

describe('readTurnUsage', () => {
  it('reads the counts code-puppy sends, filling in a missing total', () => {
    expect(readTurnUsage({ stopReason: 'end_turn', usage: { inputTokens: 19031, outputTokens: 59, totalTokens: 19090 } })).toEqual({
      inputTokens: 19031, outputTokens: 59, totalTokens: 19090,
    })
    expect(readTurnUsage({ usage: { inputTokens: 10, outputTokens: 5 } })?.totalTokens).toBe(15)
  })

  it('treats absent or malformed usage as unknown', () => {
    expect(readTurnUsage({ stopReason: 'cancelled' })).toBeNull()
    expect(readTurnUsage({ usage: null })).toBeNull()
    expect(readTurnUsage({ usage: { inputTokens: 'many', outputTokens: 1 } })).toBeNull()
    expect(readTurnUsage({ usage: { inputTokens: -1, outputTokens: 1 } })).toBeNull()
    expect(readTurnUsage(undefined)).toBeNull()
  })
})
