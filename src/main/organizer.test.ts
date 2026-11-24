import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FolderStore } from './folders'
import { Organizer } from './organizer'
import { SessionIndex } from './sessionIndex'

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'puppy-organizer-'))
  const index = new SessionIndex(join(dir, 'sessions.json'))
  const organizer = new Organizer(index, new FolderStore(join(dir, 'folders.json')))
  index.create('chat1', 'chat')
  index.create('chat2', 'chat')
  index.create('code1', 'code')
  return { dir, index, organizer }
}

describe('Organizer', () => {
  it('pins and unpins, and the pin sticks across restarts', () => {
    const { dir, index, organizer } = setup()
    organizer.pin('chat1', true)
    expect(index.get('chat1')?.pinned).toBe(true)
    expect(new SessionIndex(join(dir, 'sessions.json')).get('chat1')?.pinned).toBe(true)
    organizer.pin('chat1', false)
    expect(index.get('chat1')?.pinned).toBeUndefined()
  })

  it('treats anything but a real true as "unpinned"', () => {
    const { index, organizer } = setup()
    organizer.pin('chat1', true)
    organizer.pin('chat1', 'yes')
    expect(index.get('chat1')?.pinned).toBeUndefined()
  })

  it('files a conversation in a folder and takes it out again', () => {
    const { index, organizer } = setup()
    const folder = organizer.createFolder('Recipes', 'chat')
    organizer.move('chat1', folder.id)
    expect(index.get('chat1')?.folderId).toBe(folder.id)
    organizer.move('chat1', null)
    expect(index.get('chat1')?.folderId).toBeUndefined()
  })

  it('will not file a chat in a code folder, or the other way round', () => {
    const { index, organizer } = setup()
    const codeFolder = organizer.createFolder('Apps', 'code')
    const chatFolder = organizer.createFolder('Ideas', 'chat')
    expect(() => organizer.move('chat1', codeFolder.id)).toThrow('That folder only holds code sessions.')
    expect(() => organizer.move('code1', chatFolder.id)).toThrow('That folder only holds chats.')
    expect(index.get('chat1')?.folderId).toBeUndefined()
    organizer.move('code1', codeFolder.id)
    expect(index.get('code1')?.folderId).toBe(codeFolder.id)
  })

  it('says so for conversations or folders that are gone', () => {
    const { organizer } = setup()
    expect(() => organizer.pin('ghost', true)).toThrow('That conversation no longer exists.')
    expect(() => organizer.move('ghost', null)).toThrow('That conversation no longer exists.')
    expect(() => organizer.move('chat1', 'no-such-folder')).toThrow('That folder no longer exists.')
  })

  it('deleting a folder keeps its conversations (and their pins) and frees them', () => {
    const { index, organizer } = setup()
    const keep = organizer.createFolder('Keep', 'chat')
    const doomed = organizer.createFolder('Doomed', 'chat')
    organizer.move('chat1', doomed.id)
    organizer.pin('chat1', true)
    organizer.move('chat2', keep.id)

    organizer.deleteFolder(doomed.id)

    expect(organizer.listFolders().map((folder) => folder.name)).toEqual(['Keep'])
    expect(index.get('chat1')).toMatchObject({ pinned: true })
    expect(index.get('chat1')?.folderId).toBeUndefined()
    expect(index.get('chat2')?.folderId).toBe(keep.id) // other folders are untouched
  })

  it('passes folder rules through (rename, pin, collapse)', () => {
    const { organizer } = setup()
    const { id } = organizer.createFolder('Work', 'chat')
    organizer.updateFolder(id, { name: 'Work stuff', pinned: true, collapsed: true })
    expect(organizer.listFolders()[0]).toMatchObject({ name: 'Work stuff', pinned: true, collapsed: true })
  })
})
