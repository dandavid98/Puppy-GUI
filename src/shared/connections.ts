import type { ConnectionFileVariable, ConnectionInfo } from './api'

const TOKEN_NAME = /TOKEN|SECRET|PASSWORD|API_?KEY|JWT|CREDENTIAL/i
const ACCOUNT_NAME = /EMAIL|USER(NAME)?|ACCOUNT|LOGIN/i

/**
 * Which line of a token file is the token, and which says whose it is, so the
 * user mostly just confirms. A login token that names its own expiry wins; else
 * the name decides (PW_TOKEN, API_KEY). Empty when nothing looks right.
 */
export function guessVariables(variables: ConnectionFileVariable[]): { token: string; account: string } {
  const token = (variables.find((variable) => variable.selfExpiring) ?? variables.find((variable) => TOKEN_NAME.test(variable.name)))?.name ?? ''
  const account = variables.find((variable) => variable.name !== token && ACCOUNT_NAME.test(variable.name))?.name ?? ''
  return { token, account }
}

/** `soon` is the last day: time to renew before it stops working. */
export type Health = 'ok' | 'soon' | 'expired' | 'off' | 'unknown'

export const SOON_MS = 24 * 3_600_000

export function connectionHealth({ state, expiresAt }: Pick<ConnectionInfo, 'state' | 'expiresAt'>, now: number): Health {
  if (state === 'disconnected') return 'off'
  if (state === 'unknown') return 'unknown'
  if (expiresAt === null) return 'ok'
  if (expiresAt <= now) return 'expired'
  return expiresAt - now < SOON_MS ? 'soon' : 'ok'
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago": for a file changed `ms` ago. */
export function formatAgo(ms: number): string {
  const minutes = Math.floor(Math.max(ms, 0) / 60_000)
  const unit = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'} ago`
  if (minutes < 1) return 'just now'
  if (minutes < 60) return unit(minutes, 'minute')
  if (minutes < 1_440) return unit(Math.floor(minutes / 60), 'hour')
  return unit(Math.floor(minutes / 1_440), 'day')
}

/** "6d 16h", "5h 12m", "8m": the two biggest units, which is all a person plans around. */
export function formatRemaining(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'under a minute'
  const days = Math.floor(minutes / 1_440)
  const hours = Math.floor((minutes % 1_440) / 60)
  const part = (big: number, bigUnit: string, small: number, smallUnit: string) => (small ? `${big}${bigUnit} ${small}${smallUnit}` : `${big}${bigUnit}`)
  if (days) return part(days, 'd', hours, 'h')
  return hours ? part(hours, 'h', minutes % 60, 'm') : `${minutes}m`
}
