import { describe, expect, it } from 'vitest'
import type { Settings } from '@shared/api'
import { firstNameFrom, mergeSettings } from './settings'

describe('settings', () => {
  const base: Settings = { theme: 'system', displayName: 'Jane', smartTitles: true, autoPreview: true, thinkingMode: false }

  it('applies valid fields and ignores junk', () => {
    expect(mergeSettings(base, { theme: 'dark', smartTitles: false, displayName: '  Sam  ', autoPreview: false, thinkingMode: true })).toEqual({
      ...base, theme: 'dark', displayName: 'Sam', smartTitles: false, autoPreview: false, thinkingMode: true,
    })
    expect(mergeSettings(base, { theme: 'neon', smartTitles: 'yes', displayName: 42, autoPreview: 'no', thinkingMode: 1 })).toEqual(base)
  })

  it('derives a first name from the macOS account name', () => {
    expect(firstNameFrom('Jane Doe\n')).toBe('Jane')
    expect(firstNameFrom('Doe, Jane')).toBe('Jane')
    expect(firstNameFrom('')).toBe('')
  })
})
