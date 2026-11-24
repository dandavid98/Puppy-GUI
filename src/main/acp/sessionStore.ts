import { rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Mirror of code-puppy's ACP persistence layout (plugins/acp/persistence.py).
 *
 * Why this exists: code-puppy implements `session/close` (which deletes these
 * files), but its ACP SDK routes that method only in "unstable protocol" mode,
 * which code-puppy does not enable. So a close comes back "Method not found"
 * and we do the same cleanup ourselves. If code-puppy ever turns it on,
 * `session/close` wins and this becomes a no-op.
 */
export function acpSessionDir(env: NodeJS.ProcessEnv = process.env): string {
  const cacheRoot = env.XDG_CACHE_HOME ? join(env.XDG_CACHE_HOME, 'code_puppy') : join(homedir(), '.code_puppy')
  return join(cacheRoot, 'autosaves', 'acp')
}

/** Same sanitising rule as code-puppy's `_safe_name`. */
export function safeName(sessionId: string): string {
  return sessionId.replace(/[^A-Za-z0-9_-]/g, '_')
}

export function deletePersistedSession(sessionId: string, dir: string = acpSessionDir()): void {
  const stem = safeName(sessionId)
  for (const file of [`${stem}.json`, `${stem}.pkl`, `${stem}_meta.json`, `${stem}_acp.json`]) {
    rmSync(join(dir, file), { force: true })
  }
}
