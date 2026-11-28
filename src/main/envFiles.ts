import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { ConnectionFileSuggestion } from '@shared/api'
import { guessVariables } from '@shared/connections'
import { parseEnv } from './envFile'

/** The files that usually hold a token: `.env`, `.env.local`, `.env.production`; never the `.env.example` kind. */
const ENV_FILE = /^\.env(\.[\w.-]+)?$/
/** Copies and leftovers of an env file: not the one anybody means. */
const TEMPLATE_FILE = /\.(example|sample|template|dist|defaults?|bak|backup|old|orig|tmp)$/i
/** Where a person does not keep their work: huge, and full of files that are not theirs. */
const SKIPPED_IN_HOME = new Set(['Library', 'Applications', 'Movies', 'Music', 'Pictures', 'Public', 'node_modules'])
const SKIPPED_FOLDERS = new Set(['node_modules', 'venv', 'site-packages', '__pycache__', 'dist', 'build', 'target', 'Pods', 'vendor'])
const MAX_FILE_BYTES = 1_000_000
const PARALLEL = 32

export interface SearchLimits {
  /** Folders deep, counted from the home folder. */
  depth: number
  /** Entries looked at in total, so a huge disk cannot make this slow. */
  entries: number
  timeMs: number
  results: number
}

export const DEFAULT_LIMITS: SearchLimits = { depth: 8, entries: 60_000, timeMs: 6_000, results: 12 }

const skipFolder = (name: string) => name.startsWith('.') || SKIPPED_FOLDERS.has(name) || name.endsWith('.app') || name.endsWith('.photoslibrary')

/** "~/Desktop/work/scan-matcher": how a person says it, not /Users/them/... */
const friendlyPath = (folder: string, home: string) => (folder === home || folder.startsWith(`${home}/`) ? `~${folder.slice(home.length)}` : folder)

/** Reads a file only to know whether it holds a token-looking line: nothing from inside it is kept. */
async function holdsToken(file: string): Promise<{ modifiedMs: number } | null> {
  try {
    const info = await stat(file)
    if (!info.isFile() || info.size > MAX_FILE_BYTES) return null
    const values = parseEnv(await readFile(file, 'utf8'))
    const token = guessVariables(Object.keys(values).map((name) => ({ name, selfExpiring: false }))).token
    return token && values[token] ? { modifiedMs: info.mtimeMs } : null
  } catch {
    return null
  }
}

/**
 * Finds the files in a person's own folders that look like they hold a token,
 * newest first (the one they just renewed is the one they want). Looks level by
 * level, a few folders at a time, and gives up politely at its limits.
 */
export async function findTokenFiles(home: string, limits: SearchLimits = DEFAULT_LIMITS): Promise<ConnectionFileSuggestion[]> {
  const deadline = Date.now() + limits.timeMs
  let seen = 0
  const found: ConnectionFileSuggestion[] = []
  const exhausted = () => seen >= limits.entries || Date.now() > deadline

  const scan = async (folder: string): Promise<string[]> => {
    const subfolders: string[] = []
    let entries
    try {
      entries = await readdir(folder, { withFileTypes: true })
    } catch {
      return subfolders
    }
    for (const entry of entries) {
      if (exhausted()) break
      seen++
      if (entry.isDirectory() && !skipFolder(entry.name)) subfolders.push(join(folder, entry.name))
      else if (entry.isFile() && ENV_FILE.test(entry.name) && !TEMPLATE_FILE.test(entry.name)) {
        const file = join(folder, entry.name)
        const token = await holdsToken(file)
        if (token) found.push({ file, name: entry.name, folder: basename(folder), where: friendlyPath(folder, home), modifiedMs: token.modifiedMs })
      }
    }
    return subfolders
  }

  const top = await readdir(home, { withFileTypes: true }).catch(() => [])
  let level = top.filter((entry) => entry.isDirectory() && !skipFolder(entry.name) && !SKIPPED_IN_HOME.has(entry.name)).map((entry) => join(home, entry.name))

  for (let depth = 1; depth <= limits.depth && level.length && !exhausted(); depth++) {
    const next: string[] = []
    for (let start = 0; start < level.length && !exhausted(); start += PARALLEL) {
      const batch = await Promise.all(level.slice(start, start + PARALLEL).map(scan))
      next.push(...batch.flat())
    }
    level = next
  }
  return found.sort((a, b) => b.modifiedMs - a.modifiedMs).slice(0, limits.results)
}
