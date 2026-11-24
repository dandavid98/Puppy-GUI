import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SessionIndex } from './sessionIndex'
import { newestFirst, summarize } from './workspace'

describe('summarize', () => {
  it('combines the ACP folder with our own metadata', () => {
    const meta = { kind: 'chat' as const, title: 'Hello', updatedAt: '2026-11-24T10:00:00Z' }
    expect(summarize({ sessionId: 's1', cwd: '/repo' }, meta)).toEqual({
      sessionId: 's1', cwd: '/repo', kind: 'chat', title: 'Hello', updatedAt: '2026-11-24T10:00:00Z', contextTokens: null,
      pinned: false, folderId: null,
    })
  })

  it('carries the pin and folder the user chose', () => {
    const meta = { kind: 'chat' as const, title: 'Hello', updatedAt: '2026-11-24T10:00:00Z', pinned: true, folderId: 'f1' }
    expect(summarize({ sessionId: 's1', cwd: '/repo' }, meta)).toMatchObject({ pinned: true, folderId: 'f1' })
  })
})

describe('newestFirst', () => {
  it('sorts by updatedAt descending with unknown dates last', () => {
    const at = (updatedAt: string | null) => ({
      sessionId: String(updatedAt), cwd: '', kind: 'chat' as const, contextTokens: null, title: null, updatedAt, pinned: false, folderId: null,
    })
    const sorted = [at(null), at('2026-01-01'), at('2026-06-01')].sort(newestFirst)
    expect(sorted.map((s) => s.updatedAt)).toEqual(['2026-06-01', '2026-01-01', null])
  })
})

describe('SessionIndex', () => {
  const freshPath = () => join(mkdtempSync(join(tmpdir(), 'puppy-index-')), 'sessions.json')

  it('persists created entries across instances', () => {
    const path = freshPath()
    new SessionIndex(path).create('s1', 'code')
    expect(new SessionIndex(path).get('s1')).toMatchObject({ kind: 'code', title: null })
  })

  it('updates without bumping recency, and only existing entries', () => {
    const index = new SessionIndex(freshPath())
    const created = index.create('s1', 'chat')
    index.update('s1', { title: 'Renamed', customTitle: true })
    expect(index.get('s1')).toEqual({ ...created, title: 'Renamed', customTitle: true })
    expect(index.update('nope', { title: 'x' })).toBeUndefined()
  })

  it('removes entries for good', () => {
    const path = freshPath()
    const index = new SessionIndex(path)
    index.create('s1', 'chat')
    index.remove('s1')
    expect(new SessionIndex(path).get('s1')).toBeUndefined()
  })

  it('starts empty when the file is missing', () => {
    expect(new SessionIndex('/nonexistent/dir/sessions.json').get('x')).toBeUndefined()
  })

  it('keeps pin and folder across restarts, and clearFolder empties only that folder', () => {
    const path = freshPath()
    const index = new SessionIndex(path)
    for (const id of ['a', 'b', 'c']) index.create(id, 'chat')
    index.update('a', { pinned: true, folderId: 'f1' })
    index.update('b', { folderId: 'f1' })
    index.update('c', { folderId: 'f2' })
    index.clearFolder('f1')

    const reopened = new SessionIndex(path)
    expect(reopened.get('a')).toMatchObject({ pinned: true }) // the pin survives; only the folder goes
    expect(reopened.get('a')?.folderId).toBeUndefined()
    expect(reopened.get('b')?.folderId).toBeUndefined()
    expect(reopened.get('c')?.folderId).toBe('f2')
  })
})
