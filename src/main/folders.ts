import { randomUUID } from 'node:crypto'
import type { ChatFolder, FolderPatch } from '@shared/api'
import { readJson, writeJsonAtomic } from './jsonFile'

const MAX_NAME = 40
const KINDS: readonly unknown[] = ['chat', 'code']

/** Names show up in menus as typed, so keep them trimmed, short and never empty. */
function cleanName(name: unknown): string {
  const clean = typeof name === 'string' ? name.trim().slice(0, MAX_NAME) : ''
  if (!clean) throw new Error('Give the folder a name.')
  return clean
}

/** Trust nothing in a file the user could have hand-edited. */
function isFolder(value: unknown): value is ChatFolder {
  const folder = value as Partial<ChatFolder> | null
  return (
    typeof folder === 'object' &&
    folder !== null &&
    typeof folder.id === 'string' &&
    typeof folder.name === 'string' &&
    folder.name.trim() !== '' &&
    KINDS.includes(folder.kind) &&
    typeof folder.pinned === 'boolean' &&
    typeof folder.collapsed === 'boolean'
  )
}

/** The folders the user made to organize conversations, saved after every change. */
export class FolderStore {
  private folders: ChatFolder[]

  constructor(private readonly path: string) {
    const saved = readJson<unknown>(path, [])
    this.folders = Array.isArray(saved) ? saved.filter(isFolder) : []
  }

  list(): ChatFolder[] {
    return this.folders
  }

  get(id: string): ChatFolder | undefined {
    return this.folders.find((folder) => folder.id === id)
  }

  create(name: unknown, kind: unknown): ChatFolder {
    if (!KINDS.includes(kind)) throw new Error('Unknown folder type.')
    const folder: ChatFolder = { id: randomUUID(), name: cleanName(name), kind: kind as ChatFolder['kind'], pinned: false, collapsed: false }
    this.assertNameFree(folder.name, folder.kind)
    this.save([...this.folders, folder])
    return folder
  }

  /** Merge untrusted input (it comes over IPC) field by field; junk is ignored. */
  update(id: string, patch: Partial<Record<keyof FolderPatch, unknown>>): void {
    const folder = this.get(id)
    if (!folder) throw new Error('That folder no longer exists.')
    const next = { ...folder }
    if (patch.name !== undefined) {
      next.name = cleanName(patch.name)
      this.assertNameFree(next.name, folder.kind, id)
    }
    if (typeof patch.pinned === 'boolean') next.pinned = patch.pinned
    if (typeof patch.collapsed === 'boolean') next.collapsed = patch.collapsed
    this.save(this.folders.map((existing) => (existing.id === id ? next : existing)))
  }

  /** Deleting something already gone is fine. */
  delete(id: string): void {
    this.save(this.folders.filter((folder) => folder.id !== id))
  }

  /** Two folders with one name in a tab would be indistinguishable in the menus. */
  private assertNameFree(name: string, kind: ChatFolder['kind'], exceptId?: string): void {
    const taken = this.folders.some((folder) => folder.kind === kind && folder.id !== exceptId && folder.name.toLowerCase() === name.toLowerCase())
    if (taken) throw new Error(`You already have a folder called "${name}".`)
  }

  private save(folders: ChatFolder[]): void {
    this.folders = folders
    writeJsonAtomic(this.path, folders)
  }
}
