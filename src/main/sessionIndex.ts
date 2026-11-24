import type { WorkspaceKind } from '@shared/api'
import { readJson, writeJsonAtomic } from './jsonFile'

export interface SessionMeta {
  kind: WorkspaceKind
  title: string | null
  updatedAt: string
  /** Set when the user renamed it: smart titles must never overwrite that. */
  customTitle?: boolean
  /** Estimated context window fill after the last turn, so reopening a chat still shows it. */
  contextTokens?: number
  /** Pinned conversations stay at the top of wherever they live. */
  pinned?: boolean
  /** The user's folder it is filed in (see folders.ts). Absent when it is not in one. */
  folderId?: string
}

/**
 * What Code Puppy does not track over ACP: a session's display title, whether
 * it is a chat or a code session, and when it was last used. Also the list of
 * sessions this app owns: anything not in here is hidden from the sidebar.
 */
export class SessionIndex {
  private readonly entries: Record<string, SessionMeta>

  constructor(private readonly path: string) {
    this.entries = readJson<Record<string, SessionMeta>>(path, {})
  }

  get(sessionId: string): SessionMeta | undefined {
    return this.entries[sessionId]
  }

  create(sessionId: string, kind: WorkspaceKind): SessionMeta {
    return this.save(sessionId, { kind, title: null, updatedAt: new Date().toISOString() })
  }

  /** Patch an existing entry. Does not bump updatedAt: renaming is not "using". */
  update(sessionId: string, patch: Partial<Omit<SessionMeta, 'kind'>>): SessionMeta | undefined {
    const existing = this.entries[sessionId]
    return existing ? this.save(sessionId, { ...existing, ...patch }) : undefined
  }

  remove(sessionId: string): void {
    delete this.entries[sessionId]
    writeJsonAtomic(this.path, this.entries)
  }

  /** A folder was deleted: everything filed in it goes back to the main list. */
  clearFolder(folderId: string): void {
    const filed = Object.values(this.entries).filter((meta) => meta.folderId === folderId)
    if (!filed.length) return
    for (const meta of filed) delete meta.folderId
    writeJsonAtomic(this.path, this.entries)
  }

  private save(sessionId: string, meta: SessionMeta): SessionMeta {
    this.entries[sessionId] = meta
    writeJsonAtomic(this.path, this.entries)
    return meta
  }
}
