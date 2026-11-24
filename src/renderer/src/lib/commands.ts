import type { AvailableCommand } from '@agentclientprotocol/sdk'

const MAX_RESULTS = 8

/**
 * Commands to suggest for what's typed so far. Only while the user is still
 * typing the command word itself ("/he"), never once they've moved on to its
 * arguments. Prefix matches rank above substring matches.
 */
export function matchCommands(value: string, commands: AvailableCommand[]): AvailableCommand[] {
  const typed = /^\/(\S*)$/.exec(value)
  if (!typed) return []
  const query = typed[1].toLowerCase()
  const prefix = commands.filter((c) => c.name.toLowerCase().startsWith(query))
  const contains = commands.filter((c) => !prefix.includes(c) && c.name.toLowerCase().includes(query))
  return [...prefix, ...contains].slice(0, MAX_RESULTS)
}
