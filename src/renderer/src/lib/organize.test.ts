import { describe, expect, it } from 'vitest'
import type { ChatFolder, SessionSummary, WorkspaceKind } from '@shared/api'
import { organize, sortFolders } from './organize'

const NOW = new Date(2026, 10, 24, 15, 0)
const TODAY = new Date(2026, 10, 24, 9, 0).toISOString()

const chat = (id: string, extra: Partial<SessionSummary> = {}): SessionSummary => ({
  sessionId: id, cwd: '/tmp', kind: 'chat', title: id, updatedAt: TODAY, contextTokens: null, pinned: false, folderId: null, ...extra,
})
const folder = (id: string, name: string, extra: Partial<ChatFolder> = {}, kind: WorkspaceKind = 'chat'): ChatFolder => ({
  id, name, kind, pinned: false, collapsed: false, ...extra,
})
const ids = (sessions: SessionSummary[]) => sessions.map((session) => session.sessionId)

describe('organize', () => {
  it('shows only the current tab', () => {
    const model = organize([chat('c1'), chat('k1', { kind: 'code' })], [folder('f1', 'Recipes'), folder('f2', 'Apps', {}, 'code')], 'chat', NOW)
    expect(model.total).toBe(1)
    expect(model.folders.map((view) => view.folder.name)).toEqual(['Recipes'])
    expect(model.recent.flatMap((group) => ids(group.sessions))).toEqual(['c1'])
  })

  it('lifts loose pinned conversations out of the day groups', () => {
    const model = organize([chat('a'), chat('b', { pinned: true }), chat('c')], [], 'chat', NOW)
    expect(ids(model.pinned)).toEqual(['b'])
    expect(model.recent.flatMap((group) => ids(group.sessions))).toEqual(['a', 'c'])
  })

  it('files conversations in their folder only, pinned first, otherwise in the order given', () => {
    const sessions = [chat('new', { folderId: 'f1' }), chat('pin', { folderId: 'f1', pinned: true }), chat('old', { folderId: 'f1' }), chat('loose')]
    const model = organize(sessions, [folder('f1', 'Work')], 'chat', NOW)
    expect(ids(model.folders[0].sessions)).toEqual(['pin', 'new', 'old'])
    expect(model.recent.flatMap((group) => ids(group.sessions))).toEqual(['loose'])
    expect(ids(model.pinned)).toEqual([]) // a pin inside a folder stays inside the folder
    expect(model.total).toBe(4)
  })

  it('keeps empty folders so they can be filled', () => {
    const model = organize([], [folder('f1', 'Later')], 'chat', NOW)
    expect(model.folders).toEqual([{ folder: folder('f1', 'Later'), sessions: [] }])
    expect(model.total).toBe(0)
  })

  it('never loses a conversation whose folder is unknown, deleted or from the other tab', () => {
    const sessions = [chat('ghost', { folderId: 'deleted' }), chat('wrong', { folderId: 'code-folder' }), chat('pinned-ghost', { folderId: 'deleted', pinned: true })]
    const model = organize(sessions, [folder('code-folder', 'Apps', {}, 'code')], 'chat', NOW)
    expect(model.recent.flatMap((group) => ids(group.sessions)).sort()).toEqual(['ghost', 'wrong'])
    expect(ids(model.pinned)).toEqual(['pinned-ghost'])
  })
})

describe('sortFolders', () => {
  it('puts pinned folders first, then goes alphabetical regardless of case', () => {
    const sorted = sortFolders([folder('1', 'zebra'), folder('2', 'Apple'), folder('3', 'mango', { pinned: true }), folder('4', 'banana')])
    expect(sorted.map((f) => f.name)).toEqual(['mango', 'Apple', 'banana', 'zebra'])
  })

  it('orders pinned folders alphabetically among themselves, and does not mutate its input', () => {
    const input = [folder('1', 'b', { pinned: true }), folder('2', 'a', { pinned: true })]
    expect(sortFolders(input).map((f) => f.name)).toEqual(['a', 'b'])
    expect(input.map((f) => f.name)).toEqual(['b', 'a'])
  })
})
