import type { ChatFolder, FolderPatch, WorkspaceKind } from '@shared/api'
import type { FolderStore } from './folders'
import type { SessionIndex, SessionMeta } from './sessionIndex'

const TABS: Record<WorkspaceKind, string> = { chat: 'chats', code: 'code sessions' }

/**
 * How the user sorts their conversations: pinning them and filing them in folders.
 * It only touches our own bookkeeping (the session index and folder list), never Code Puppy's.
 */
export class Organizer {
  constructor(
    private readonly index: SessionIndex,
    private readonly folders: FolderStore,
  ) {}

  pin(sessionId: string, pinned: unknown): void {
    this.known(sessionId)
    this.index.update(sessionId, { pinned: pinned === true || undefined })
  }

  /** File a conversation in a folder of its own tab, or take it out with null. */
  move(sessionId: string, folderId: string | null): void {
    const meta = this.known(sessionId)
    if (folderId !== null) {
      const folder = this.folders.get(folderId)
      if (!folder) throw new Error('That folder no longer exists.')
      if (folder.kind !== meta.kind) throw new Error(`That folder only holds ${TABS[folder.kind]}.`)
    }
    this.index.update(sessionId, { folderId: folderId ?? undefined })
  }

  listFolders(): ChatFolder[] {
    return this.folders.list()
  }

  createFolder(name: unknown, kind: unknown): ChatFolder {
    return this.folders.create(name, kind)
  }

  updateFolder(id: string, patch: Partial<Record<keyof FolderPatch, unknown>>): void {
    this.folders.update(id, patch)
  }

  /** Only the folder goes: its conversations are kept and return to the main list. */
  deleteFolder(id: string): void {
    this.folders.delete(id)
    this.index.clearFolder(id)
  }

  private known(sessionId: string): SessionMeta {
    const meta = this.index.get(sessionId)
    if (!meta) throw new Error('That conversation no longer exists.')
    return meta
  }
}
