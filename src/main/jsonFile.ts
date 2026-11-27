import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** Read a JSON file, falling back on first run or if the file is unreadable. */
export function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

/** Write via temp file + rename so a crash can never leave half a file behind. `mode` limits who may read it. */
export function writeJsonAtomic(path: string, value: unknown, mode?: number): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2), { mode })
  renameSync(tmp, path)
}
