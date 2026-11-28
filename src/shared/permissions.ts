import type { PermissionOption } from '@agentclientprotocol/sdk'

/**
 * How much Code Puppy may do in a chat without asking.
 *
 * - `ask`: before every file change and every command.
 * - `standard`: as Code Puppy is set up (its own settings decide). The default.
 * - `full`: never; Code Puppy has full authority.
 */
export const PERMISSION_LEVELS = ['ask', 'standard', 'full'] as const
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number]

export const DEFAULT_PERMISSION_LEVEL: PermissionLevel = 'standard'

export const PERMISSION_INFO: Record<PermissionLevel, { label: string; description: string }> = {
  ask: { label: 'Ask every time', description: 'Asks before every change or command' },
  standard: { label: 'Standard', description: "Follows Code Puppy's own settings" },
  full: { label: 'Full access', description: 'Never asks. Full control of your files' },
}

export function isPermissionLevel(value: unknown): value is PermissionLevel {
  return typeof value === 'string' && (PERMISSION_LEVELS as readonly string[]).includes(value)
}

/** The option that says yes (once), or null if Code Puppy offered none: then someone must be asked. */
export function allowOption(options: readonly PermissionOption[]): string | null {
  return (options.find((option) => option.kind === 'allow_once') ?? options.find((option) => option.kind === 'allow_always'))?.optionId ?? null
}
