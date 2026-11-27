import type { ConnectionInfo } from './api'

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
