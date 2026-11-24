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

  private save(sessionId: string, meta: SessionMeta): SessionMeta {
    this.entries[sessionId] = meta
    writeJsonAtomic(this.path, this.entries)
    return meta
  }
}
