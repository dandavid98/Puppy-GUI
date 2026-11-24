import { describe, expect, it } from 'vitest'
import type { Settings } from '@shared/api'
import { firstNameFrom, mergeSettings } from './settings'
import { cleanTitle, titleFrom, titlePrompt } from './titles'

describe('titleFrom', () => {
  it('uses the first line of the message', () => {
    expect(titleFrom('  Fix the login bug\nmore details here')).toBe('Fix the login bug')
  })

  it('truncates long titles with an ellipsis', () => {
    const title = titleFrom('x'.repeat(200))
    expect(title.length).toBeLessThanOrEqual(60)
    expect(title.endsWith('...')).toBe(true)
  })
})

describe('cleanTitle', () => {
  it.each([
    ['Fixing the login bug', 'Fixing the login bug'],
    ['"Fixing the login bug."', 'Fixing the login bug'],
    ['Title: Fixing the login bug', 'Fixing the login bug'],
    ['**Title:** Fixing the login bug', 'Fixing the login bug'],
    ['\n\n# Fixing the login bug\nSome explanation', 'Fixing the login bug'],
  ])('cleans %j', (reply, expected) => {
    expect(cleanTitle(reply)).toBe(expected)
  })

  it('returns null for an empty reply', () => {
    expect(cleanTitle('  \n "" ')).toBeNull()
  })
})

describe('titlePrompt', () => {
  it('caps how much of the message is sent', () => {
    expect(titlePrompt('y'.repeat(10_000)).length).toBeLessThan(1500)
  })
})

describe('settings', () => {
  const base: Settings = { theme: 'system', displayName: 'Jane', smartTitles: true, autoPreview: true }

  it('applies valid fields and ignores junk', () => {
    expect(mergeSettings(base, { theme: 'dark', smartTitles: false, displayName: '  Sam  ', autoPreview: false })).toEqual({
      ...base, theme: 'dark', displayName: 'Sam', smartTitles: false, autoPreview: false,
    })
    expect(mergeSettings(base, { theme: 'neon', smartTitles: 'yes', displayName: 42, autoPreview: 'no' })).toEqual(base)
  })

  it('derives a first name from the macOS account name', () => {
    expect(firstNameFrom('Jane Doe\n')).toBe('Jane')
    expect(firstNameFrom('Doe, Jane')).toBe('Jane')
    expect(firstNameFrom('')).toBe('')
  })
})
