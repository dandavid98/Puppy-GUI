import { DEFAULT_PERMISSION_LEVEL, isPermissionLevel, type PermissionLevel } from '@shared/permissions'

/** Each open chat's permission level. A chat nobody has set is standard. */
export class PermissionLevels {
  private readonly levels = new Map<string, PermissionLevel>()

  get(sessionId: string): PermissionLevel {
    return this.levels.get(sessionId) ?? DEFAULT_PERMISSION_LEVEL
  }

  set(sessionId: string, level: PermissionLevel): void {
    this.levels.set(sessionId, level)
  }

  forget(sessionId: string): void {
    this.levels.delete(sessionId)
  }
}

/**
 * The level Code Puppy says it applied, from its answer to `session/set_mode`.
 *
 * Code Puppy as shipped accepts any mode and does nothing, so a bare answer proves
 * nothing: only Puppy's own bootstrap (see launch.ts) says `_meta.puppy.permission`.
 * Null means it did not.
 */
export function confirmedLevel(response: unknown): PermissionLevel | null {
  const meta = (response as { _meta?: { puppy?: { permission?: unknown } } } | null | undefined)?._meta
  const level = meta?.puppy?.permission
  return isPermissionLevel(level) ? level : null
}
