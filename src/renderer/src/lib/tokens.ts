/** 1234 -> "1.2k", 18432 -> "18k", 272000 -> "272k", 1000000 -> "1M". */
export function formatTokens(tokens: number): string {
  const trim = (value: number) => (value >= 10 ? Math.round(value) : Math.round(value * 10) / 10).toString()
  if (tokens >= 1_000_000) return `${trim(tokens / 1_000_000)}M`
  if (tokens >= 1_000) return `${trim(tokens / 1_000)}k`
  return String(Math.round(tokens))
}

/**
 * Whole percent of `total` that `used` represents, capped at 100 (a full ring is
 * "100%"). Any use at all shows at least 1% so a tiny but real amount never reads as untouched.
 */
export function percentOf(used: number, total: number): number {
  if (!(total > 0) || !(used > 0)) return 0
  return Math.min(100, Math.max(1, Math.round((used / total) * 100)))
}
