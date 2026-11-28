/**
 * Recognising that a turn stopped because the user ran out of quota, from the
 * notice Code Puppy streams when a turn fails.
 *
 * Code Puppy words every failed turn "<warning sign> The agent run failed: <the error>". When the
 * gateway refuses for quota, the error carries the gateway's own words, and Code
 * Puppy's Walmart plugin (quota_errors.py) matches the same phrases to tell a spent
 * quota from a passing provider overload. Matching them here is deliberately just as
 * strict: a different wording means "not recognised", and the user sees the error as
 * they do today, never a switch nobody asked for.
 */

/** How Code Puppy begins the notice of a failed turn. */
export const RUN_FAILED = '\u26a0\ufe0f The agent run failed'

export type UsageLimit = 'large_model_tokens' | 'tokens' | 'requests'

/** Most specific first: the large-model phrase contains the plain token one. */
const PHRASES: ReadonlyArray<readonly [UsageLimit, readonly string[]]> = [
  ['large_model_tokens', ['large-model token quota exceeded', 'large model token quota exceeded']],
  ['tokens', ['token quota exceeded']],
  ['requests', ['request limit exceeded', 'request quota exceeded']],
]

/** The machine-readable form the backend is moving to (`'quota_kind': 'large_model_tokens'`), which Code Puppy already accepts. */
const QUOTA_KIND = /quota_kind['"]?\s*:\s*['"]?(large_model_tokens|tokens|requests)\b/i

/** Which limit a notice says was reached, or null if it is not that kind of notice. */
export function usageLimitIn(message: string): UsageLimit | null {
  const text = message.trim()
  if (!text.startsWith(RUN_FAILED)) return null // the model's own words, even about quotas, are not a block
  const structured = QUOTA_KIND.exec(text)?.[1]
  if (structured) return structured.toLowerCase() as UsageLimit
  const lower = text.toLowerCase()
  return PHRASES.find(([, phrases]) => phrases.some((phrase) => lower.includes(phrase)))?.[0] ?? null
}

/** Another model can help, unless the limit is on requests, which are counted across every model. */
export function switchingHelps(limit: UsageLimit): boolean {
  return limit !== 'requests'
}
