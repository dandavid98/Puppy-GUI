import type { ChatFolder, SessionSummary, WorkspaceKind } from '@shared/api'
import { groupByRecency, type SessionGroup } from './format'

export interface FolderView {
  folder: ChatFolder
  /** Pinned conversations first, then newest first. */
  sessions: SessionSummary[]
}

/** What the sidebar shows for one tab, top to bottom. */
export interface SidebarModel {
  /** Pinned conversations that are not in a folder. */
  pinned: SessionSummary[]
  folders: FolderView[]
  /** Everything else, by day. */
  recent: SessionGroup[]
  /** Conversations in this tab, folders included: zero means "nothing here yet". */
  total: number
}

const byName = (a: ChatFolder, b: ChatFolder) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

/** Pinned folders first, then alphabetical (ignoring case). */
export function sortFolders(folders: ChatFolder[]): ChatFolder[] {
  return [...folders].sort((a, b) => Number(b.pinned) - Number(a.pinned) || byName(a, b))
}

/** Keeps the incoming (newest first) order inside each of the two groups. */
function pinnedFirst(sessions: SessionSummary[]): SessionSummary[] {
  return [...sessions.filter((session) => session.pinned), ...sessions.filter((session) => !session.pinned)]
}

/**
 * Sort one tab's conversations into the sidebar: loose pinned ones, then folders, then
 * the rest by day. A conversation pointing at a folder we do not know (deleted, or from
 * the other tab) is simply treated as not filed, so nothing can ever disappear.
 */
export function organize(sessions: SessionSummary[], folders: ChatFolder[], mode: WorkspaceKind, now: Date = new Date()): SidebarModel {
  const mine = sessions.filter((session) => session.kind === mode)
  const myFolders = folders.filter((folder) => folder.kind === mode)
  const known = new Set(myFolders.map((folder) => folder.id))
  const isFiled = (session: SessionSummary) => session.folderId !== null && known.has(session.folderId)
  const loose = mine.filter((session) => !isFiled(session))

  return {
    total: mine.length,
    pinned: loose.filter((session) => session.pinned),
    folders: sortFolders(myFolders).map((folder) => ({
      folder,
      sessions: pinnedFirst(mine.filter((session) => session.folderId === folder.id)),
    })),
    recent: groupByRecency(
      loose.filter((session) => !session.pinned),
      now,
    ),
  }
}
