import type { QuotaSnapshot } from '@shared/api'
import { formatTokens, percentOf } from './tokens'

/**
 * Models at the top burn rate count against the separate large-model quota.
 * The server does not publish which models are "large"; this is inferred, and
 * the one refusal on record (claude-opus-4-8, burn rate 1.0, "Large-model token
 * quota exceeded") fits. Change it here if a model turns out to be misfiled.
 */
export const LARGE_MODEL_MIN_BURN_RATE = 1

export type ModelQuota =
  | { kind: 'free' }
  | { kind: 'metered'; bucket: 'large' | 'standard'; percent: number; used: number; limit: number; blockedByStandard?: boolean }

/** Where this model stands on the user's real quota; null when we cannot tell (so no ring rather than a wrong one). */
export function quotaForModel(quota: QuotaSnapshot, model: string): ModelQuota | null {
  const rate = quota.burnRates[model]
  if (rate === undefined) return null
  if (rate === 0) return { kind: 'free' }

  const { standard, large } = quota
  if (rate >= LARGE_MODEL_MIN_BURN_RATE) {
    // Large-model quota is carved out of the standard one: nothing is left for large models once standard is spent.
    if (standard.limit > 0 && standard.used >= standard.limit) {
      return { kind: 'metered', bucket: 'large', percent: 100, used: large.used, limit: large.limit, blockedByStandard: true }
    }
    if (large.limit <= 0) return null
    return { kind: 'metered', bucket: 'large', percent: percentOf(large.used, large.limit), used: large.used, limit: large.limit }
  }
  if (standard.limit <= 0) return null
  return { kind: 'metered', bucket: 'standard', percent: percentOf(standard.used, standard.limit), used: standard.used, limit: standard.limit }
}

/** Seconds until the quota resets, counting down from when we read it. */
export function secondsUntilReset(quota: QuotaSnapshot, now: number): number {
  return Math.max(0, quota.resetsInSecs - Math.floor((now - quota.fetchedAt) / 1000))
}

/** 5340 -> "1h 29m", 600 -> "10m", 30 -> "under a minute". */
export function formatReset(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  if (minutes < 1) return 'under a minute'
  const hours = Math.floor(minutes / 60)
  return hours ? `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ''}` : `${minutes}m`
}

/** The sentence behind a ring: tooltips and screen readers. */
export function describeModelQuota(model: string, quota: ModelQuota, resetsIn: string): string {
  if (quota.kind === 'free') return `${model}: free, it does not use your quota.`
  if (quota.blockedByStandard) return `${model}: your standard quota is used up, so large models are unavailable. Resets in ${resetsIn}.`
  const name = quota.bucket === 'large' ? 'large-model' : 'standard'
  return `${model}: ${quota.percent}% of your ${name} quota used (${formatTokens(quota.used)} of ${formatTokens(quota.limit)}). Resets in ${resetsIn}.`
}

/** One line for the bottom of the model menu. */
export function quotaSummary(quota: QuotaSnapshot, now: number): string {
  const parts = []
  if (quota.large.limit > 0) parts.push(`Large ${percentOf(quota.large.used, quota.large.limit)}%`)
  if (quota.standard.limit > 0) parts.push(`Others ${percentOf(quota.standard.used, quota.standard.limit)}%`)
  parts.push(`resets in ${formatReset(secondsUntilReset(quota, now))}`)
  return parts.join(' · ')
}
