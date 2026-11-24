import { describe, expect, it } from 'vitest'
import type { SessionSummary } from '@shared/api'
import { folderName, greeting, groupByRecency, prettyPath, recentFolders } from './format'

const NOW = new Date(2026, 10, 24, 15, 0) // Tue 24 Nov 2026, 3pm local

const session = (id: string, updatedAt: string | null, kind: 'chat' | 'code' = 'chat', cwd = '/tmp'): SessionSummary => ({
  sessionId: id, cwd, kind, title: id, updatedAt, contextTokens: null, pinned: false, folderId: null,
})

describe('groupByRecency', () => {
  it('buckets sessions by day and keeps the input order', () => {
    const groups = groupByRecency(
      [
        session('a', new Date(2026, 10, 24, 9).toISOString()),
        session('b', new Date(2026, 10, 23, 22).toISOString()),
        session('c', new Date(2026, 10, 19).toISOString()),
        session('d', new Date(2026, 8, 1).toISOString()),
        session('e', null),
      ],
      NOW,
    )
    expect(groups.map((g) => [g.label, g.sessions.map((s) => s.sessionId)])).toEqual([
      ['Today', ['a']],
      ['Yesterday', ['b']],
      ['Previous 7 days', ['c']],
      ['Older', ['d', 'e']],
    ])
  })
})

describe('helpers', () => {
  it('greets by time of day', () => {
    expect(greeting(NOW)).toBe('Good afternoon')
    expect(greeting(new Date(2026, 0, 1, 8))).toBe('Good morning')
  })

  it('shortens home paths and names folders', () => {
    expect(prettyPath('/Users/jane/code/app')).toBe('~/code/app')
    expect(folderName('/Users/jane/code/app/')).toBe('app')
  })

  it('lists unique recent code folders only', () => {
    const sessions = [
      session('1', null, 'code', '/a'),
      session('2', null, 'chat', '/chat'),
      session('3', null, 'code', '/b'),
      session('4', null, 'code', '/a'),
    ]
    expect(recentFolders(sessions)).toEqual(['/a', '/b'])
  })
})
