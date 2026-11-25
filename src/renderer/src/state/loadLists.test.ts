import { describe, expect, it } from 'vitest'
import type { ChatFolder, SessionSummary } from '@shared/api'
import { loadLists } from './loadLists'

const session = { sessionId: 's1' } as SessionSummary
const folder = { id: 'f1' } as ChatFolder
const describeError = (error: unknown) => (error as Error).message

describe('loadLists', () => {
  it('returns both lists when both can be read', async () => {
    const lists = await loadLists({ listSessions: async () => [session], listFolders: async () => [folder] }, describeError)
    expect(lists).toEqual({ sessions: [session], folders: [folder], problems: [] })
  })

  it('still shows the conversations when the folders cannot be read (and says so)', async () => {
    const lists = await loadLists(
      { listSessions: async () => [session], listFolders: async () => Promise.reject(new Error("No handler registered for 'folder:list'")) },
      describeError,
    )
    expect(lists.sessions).toEqual([session])
    expect(lists.folders).toBeNull()
    expect(lists.problems).toEqual(["Couldn't load your folders: No handler registered for 'folder:list'"])
  })

  it('still shows the folders when the conversations cannot be read (and says so)', async () => {
    const lists = await loadLists(
      { listSessions: async () => Promise.reject(new Error('Method not found')), listFolders: async () => [folder] },
      describeError,
    )
    expect(lists.sessions).toBeNull()
    expect(lists.folders).toEqual([folder])
    expect(lists.problems).toEqual(["Couldn't load your conversations: Method not found"])
  })

  it('reports both problems when neither can be read', async () => {
    const boom = async () => Promise.reject(new Error('down'))
    const lists = await loadLists({ listSessions: boom, listFolders: boom }, describeError)
    expect(lists.problems).toHaveLength(2)
    expect(lists.sessions).toBeNull()
    expect(lists.folders).toBeNull()
  })
})
