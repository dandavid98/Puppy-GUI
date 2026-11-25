import type { ChatFolder, PuppyApi, SessionSummary } from '@shared/api'

export interface Lists {
  /** null when that list could not be read: keep showing what you had. */
  sessions: SessionSummary[] | null
  folders: ChatFolder[] | null
  /** One plain-words sentence per list that could not be read. */
  problems: string[]
}

/** Read the conversations and the folders on their own: one failing must never hide the other. */
export async function loadLists(source: Pick<PuppyApi, 'listSessions' | 'listFolders'>, describe: (error: unknown) => string): Promise<Lists> {
  const [sessions, folders] = await Promise.allSettled([source.listSessions(), source.listFolders()])
  const problems: string[] = []
  if (sessions.status === 'rejected') problems.push(`Couldn't load your conversations: ${describe(sessions.reason)}`)
  if (folders.status === 'rejected') problems.push(`Couldn't load your folders: ${describe(folders.reason)}`)
  return {
    sessions: sessions.status === 'fulfilled' ? sessions.value : null,
    folders: folders.status === 'fulfilled' ? folders.value : null,
    problems,
  }
}
