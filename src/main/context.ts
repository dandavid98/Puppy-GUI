// How full a conversation's context window is, estimated from what ACP reports per turn.

/** Token counts exactly as ACP reports them for one prompt turn (a sum over every model request in it). */
export interface TurnTokens {
  inputTokens: number
  outputTokens: number
}

/**
 * Pull the token counts out of a prompt response. The stable ACP types omit
 * `usage` (only the unstable schema declares it) although code-puppy sends it,
 * so read it defensively: anything malformed counts as "unknown".
 */
export function readTurnUsage(response: unknown): (TurnTokens & { totalTokens: number }) | null {
  const raw = (response as { usage?: Record<string, unknown> | null } | null)?.usage
  if (!raw) return null
  const input = Number(raw.inputTokens)
  const output = Number(raw.outputTokens)
  if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) return null
  const total = Number(raw.totalTokens)
  return { inputTokens: input, outputTokens: output, totalTokens: Number.isFinite(total) && total >= 0 ? total : input + output }
}

export interface ContextInput extends TurnTokens {
  /** Context size after the previous turn, if known: the size the first request of this turn started from. */
  previous: number | null
  /** Tool calls made this turn. Each one costs a further model request. */
  toolCalls: number
  contextLength: number
}

/**
 * Estimate how full the context window is after a turn.
 *
 * ACP only gives us totals summed over all the model requests in a turn, but
 * context size is what the LAST request carried. Cases:
 *  - one request (no tools): the totals are exact.
 *  - several requests: input grows request by request, so assume it grows
 *    linearly from `previous`; then last = 2 * average - first. Clamped to what
 *    the totals allow, so a stale `previous` can never produce nonsense.
 */
export function estimateContext({ previous, inputTokens, outputTokens, toolCalls, contextLength }: ContextInput): number {
  const requests = toolCalls + 1
  if (requests === 1) return Math.min(contextLength, inputTokens + outputTokens)

  const average = inputTokens / requests
  const first = Math.min(previous ?? average, average)
  const linear = 2 * average - first
  const ceiling = inputTokens - (requests - 1) * first // the other requests carried at least `first` each
  const last = Math.max(average, Math.min(linear, ceiling))
  return Math.round(Math.min(contextLength, last + outputTokens))
}
