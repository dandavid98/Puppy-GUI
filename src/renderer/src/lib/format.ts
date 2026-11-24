import type { SessionSummary } from '@shared/api'

const DAY = 24 * 60 * 60 * 1000

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function greeting(now: Date = new Date()): string {
  const hour = now.getHours()
  if (hour < 5) return 'Up late'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export interface SessionGroup {
  label: string
  sessions: SessionSummary[]
}

/** Sidebar buckets: Today / Yesterday / Previous 7 days / Older (order preserved). */
export function groupByRecency(sessions: SessionSummary[], now: Date = new Date()): SessionGroup[] {
  const today = startOfDay(now)
  const bucket = (updatedAt: string | null): string => {
    if (!updatedAt) return 'Older'
    const day = startOfDay(new Date(updatedAt))
    if (day >= today) return 'Today'
    if (day >= today - DAY) return 'Yesterday'
    if (day >= today - 7 * DAY) return 'Previous 7 days'
    return 'Older'
  }
  const groups = new Map<string, SessionSummary[]>()
  for (const session of sessions) {
    const label = bucket(session.updatedAt)
    groups.set(label, [...(groups.get(label) ?? []), session])
  }
  return ['Today', 'Yesterday', 'Previous 7 days', 'Older']
    .filter((label) => groups.has(label))
    .map((label) => ({ label, sessions: groups.get(label)! }))
}

/** "/Users/jane/code/app" -> "~/code/app" */
export function prettyPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, '~')
}

export function folderName(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? path
}

/** Unique project folders from code sessions, most recently used first. */
export function recentFolders(sessions: SessionSummary[], limit = 5): string[] {
  const folders = sessions.filter((s) => s.kind === 'code').map((s) => s.cwd)
  return [...new Set(folders)].slice(0, limit)
}
