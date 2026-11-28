import { describe, expect, it } from 'vitest'
import type { ModelFallbackSettings } from './api'
import { fallbackPair, switchingChange, withMain } from './modelFallback'

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

describe('withMain', () => {
  it('makes a model the main one, and lets go of the secondary when it is the same model', () => {
    expect(withMain(ON, 'gpt-5.6-sol')).toEqual({ ...ON, main: 'gpt-5.6-sol' })
    expect(withMain(ON, ON.secondary!)).toEqual({ ...ON, main: ON.secondary, secondary: null })
  })
})

describe('switchingChange', () => {
  const SOL = 'gpt-5.6-sol'

  it('is off for a chat put on a model that is neither of the two, and on again when it is back on one', () => {
    expect(switchingChange(ON, ON.main, SOL)).toBe('off')
    expect(switchingChange(ON, ON.secondary, SOL)).toBe('off')
    expect(switchingChange(ON, SOL, ON.main)).toBe('on')
    expect(switchingChange(ON, SOL, ON.secondary)).toBe('on')
  })

  it('says nothing when it does not change, or switching is not set up', () => {
    expect(switchingChange(ON, ON.main, ON.secondary)).toBeNull()
    expect(switchingChange(ON, SOL, 'gemini-3.5-flash')).toBeNull()
    expect(switchingChange({ ...ON, enabled: false }, ON.main, SOL)).toBeNull()
    expect(switchingChange({ ...ON, secondary: null }, ON.main, SOL)).toBeNull()
  })
})
