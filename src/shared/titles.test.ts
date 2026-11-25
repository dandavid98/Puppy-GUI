import { describe, expect, it } from 'vitest'
import { cleanTitle, titleFrom, titlePrompt, titleSource } from './titles'

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

describe('titleSource', () => {
  it('is the message text when there is some', () => {
    expect(titleSource('  Hello there  ', [{ name: 'a.png' }])).toBe('Hello there')
  })

  it('falls back to the names of what was attached, and to nothing at all', () => {
    expect(titleSource('   ', [{ name: 'a.png' }, { name: 'notes.txt' }])).toBe('a.png, notes.txt')
    expect(titleSource('')).toBe('')
  })
})
