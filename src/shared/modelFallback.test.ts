import { describe, expect, it } from 'vitest'
import type { ModelFallbackSettings } from './api'
import { fallbackPair } from './modelFallback'

const ON: ModelFallbackSettings = { enabled: true, main: 'claude-opus-5-5', secondary: 'claude-sonnet-5-5' }

describe('fallbackPair', () => {
  it('needs the switch on, both models chosen, and two different ones', () => {
    expect(fallbackPair(ON)).toEqual({ main: 'claude-opus-5-5', secondary: 'claude-sonnet-5-5' })
    expect(fallbackPair({ ...ON, enabled: false })).toBeNull()
    expect(fallbackPair({ ...ON, main: null })).toBeNull()
    expect(fallbackPair({ ...ON, secondary: null })).toBeNull()
    expect(fallbackPair({ ...ON, secondary: ON.main })).toBeNull()
  })
})
