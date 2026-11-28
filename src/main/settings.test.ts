import { describe, expect, it } from 'vitest'
import type { Settings } from '@shared/api'
import { firstNameFrom, mergeSettings } from './settings'

describe('settings', () => {
  const base: Settings = { theme: 'system', displayName: 'Jane', smartTitles: true, autoPreview: true, thinkingMode: false, defaultAgent: null, modelFallback: { enabled: false, main: null, secondary: null } }

  it('applies valid fields and ignores junk', () => {
    expect(mergeSettings(base, { theme: 'dark', smartTitles: false, displayName: '  Sam  ', autoPreview: false, thinkingMode: true })).toEqual({
      ...base, theme: 'dark', displayName: 'Sam', smartTitles: false, autoPreview: false, thinkingMode: true,
    })
    expect(mergeSettings(base, { theme: 'neon', smartTitles: 'yes', displayName: 42, autoPreview: 'no', thinkingMode: 1 })).toEqual(base)
  })

  it('takes an agent name or null for the default agent, and nothing that could smuggle in more', () => {
    expect(mergeSettings(base, { defaultAgent: 'qa-kitten' }).defaultAgent).toBe('qa-kitten')
    expect(mergeSettings({ ...base, defaultAgent: 'qa-kitten' }, { defaultAgent: null }).defaultAgent).toBeNull()
    for (const junk of ['', 'a b', '../../etc', 'x; rm -rf /', 7, 'x'.repeat(81)]) {
      expect(mergeSettings(base, { defaultAgent: junk }).defaultAgent).toBeNull()
    }
  })

  describe('model fallback', () => {
    it('is off, with no models chosen, until the user sets it up', () => {
      expect(base.modelFallback).toEqual({ enabled: false, main: null, secondary: null })
    })

    it('takes each field on its own, keeping the rest', () => {
      const on = mergeSettings(base, { modelFallback: { enabled: true } })
      expect(on.modelFallback).toEqual({ enabled: true, main: null, secondary: null })
      const main = mergeSettings(on, { modelFallback: { main: 'claude-opus-5-5' } })
      const both = mergeSettings(main, { modelFallback: { secondary: 'claude-sonnet-5-5' } })
      expect(both.modelFallback).toEqual({ enabled: true, main: 'claude-opus-5-5', secondary: 'claude-sonnet-5-5' })
      expect(mergeSettings(both, { modelFallback: { enabled: false } }).modelFallback).toEqual({ ...both.modelFallback, enabled: false })
      expect(mergeSettings(both, { modelFallback: { secondary: null } }).modelFallback.secondary).toBeNull()
    })

    it('ignores anything that is not a flag or a model name, and leaves the other settings alone', () => {
      const set = { enabled: true, main: 'gpt-5.6-sol', secondary: 'claude-sonnet-5-5' }
      const start = { ...base, modelFallback: set }
      for (const junk of [null, 'on', 7, [], { enabled: 'yes', main: 7, secondary: '' }, { main: 'a b', secondary: '../../etc; rm -rf /' }, { main: 'x'.repeat(121) }]) {
        expect(mergeSettings(start, { modelFallback: junk })).toEqual(start)
      }
      expect(mergeSettings(start, { theme: 'dark' }).modelFallback).toEqual(set)
    })
  })

  it('derives a first name from the macOS account name', () => {
    expect(firstNameFrom('Jane Doe\n')).toBe('Jane')
    expect(firstNameFrom('Doe, Jane')).toBe('Jane')
    expect(firstNameFrom('')).toBe('')
  })
})
