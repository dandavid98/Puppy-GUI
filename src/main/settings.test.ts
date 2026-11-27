import { describe, expect, it } from 'vitest'
import type { Settings } from '@shared/api'
import { firstNameFrom, mergeSettings } from './settings'

describe('settings', () => {
  const base: Settings = { theme: 'system', displayName: 'Jane', smartTitles: true, autoPreview: true, thinkingMode: false, defaultAgent: null }

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

  it('derives a first name from the macOS account name', () => {
    expect(firstNameFrom('Jane Doe\n')).toBe('Jane')
    expect(firstNameFrom('Doe, Jane')).toBe('Jane')
    expect(firstNameFrom('')).toBe('')
  })
})
