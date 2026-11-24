import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FolderStore } from './folders'

const freshPath = () => join(mkdtempSync(join(tmpdir(), 'puppy-folders-')), 'folders.json')

describe('FolderStore', () => {
  it('creates folders that start unpinned and open, and remembers them across restarts', () => {
    const path = freshPath()
    const made = new FolderStore(path).create('  Recipes  ', 'chat')
    expect(made).toMatchObject({ name: 'Recipes', kind: 'chat', pinned: false, collapsed: false })
    expect(new FolderStore(path).list()).toEqual([made])
  })

  it('refuses empty or blank names, and unknown tabs', () => {
    const store = new FolderStore(freshPath())
    expect(() => store.create('   ', 'chat')).toThrow('Give the folder a name.')
    expect(() => store.create(42, 'chat')).toThrow('Give the folder a name.')
    expect(() => store.create('Work', 'bogus')).toThrow('Unknown folder type.')
    expect(store.list()).toEqual([])
  })

  it('keeps names to a sensible length', () => {
    expect(new FolderStore(freshPath()).create('x'.repeat(100), 'chat').name).toHaveLength(40)
  })

  it('does not allow two folders with the same name in a tab, ignoring case', () => {
    const store = new FolderStore(freshPath())
    store.create('Work', 'chat')
    expect(() => store.create('work', 'chat')).toThrow('You already have a folder called "work".')
    expect(store.create('Work', 'code').kind).toBe('code') // another tab, another namespace
  })

  it('renames, pins and collapses; renaming to its own name in other letters is fine', () => {
    const store = new FolderStore(freshPath())
    const { id } = store.create('work', 'chat')
    store.update(id, { name: 'Work', pinned: true, collapsed: true })
    expect(store.get(id)).toMatchObject({ name: 'Work', pinned: true, collapsed: true })
  })

  it('refuses a rename onto another folder, and ignores junk fields', () => {
    const store = new FolderStore(freshPath())
    store.create('A', 'chat')
    const { id } = store.create('B', 'chat')
    expect(() => store.update(id, { name: 'a' })).toThrow('already have a folder')
    store.update(id, { pinned: 'yes', collapsed: 1, kind: 'code', id: 'hijack' } as never)
    expect(store.get(id)).toMatchObject({ id, name: 'B', kind: 'chat', pinned: false, collapsed: false })
  })

  it('says so when updating a folder that is gone, but deleting one is harmless', () => {
    const store = new FolderStore(freshPath())
    expect(() => store.update('nope', { pinned: true })).toThrow('no longer exists')
    expect(() => store.delete('nope')).not.toThrow()
  })

  it('deletes for good', () => {
    const path = freshPath()
    const store = new FolderStore(path)
    const { id } = store.create('Temp', 'chat')
    store.delete(id)
    expect(new FolderStore(path).list()).toEqual([])
  })

  it('survives a missing, corrupt or hand-mangled file', () => {
    expect(new FolderStore('/nonexistent/dir/folders.json').list()).toEqual([])
    const path = freshPath()
    writeFileSync(path, '{not json')
    expect(new FolderStore(path).list()).toEqual([])
    writeFileSync(path, JSON.stringify([
      { id: 'ok', name: 'Fine', kind: 'chat', pinned: false, collapsed: false },
      { id: 'bad-kind', name: 'X', kind: 'nope', pinned: false, collapsed: false },
      { id: 'no-name', name: '  ', kind: 'chat', pinned: false, collapsed: false },
      'junk',
      null,
    ]))
    expect(new FolderStore(path).list().map((folder) => folder.id)).toEqual(['ok'])
  })
})
