export interface Reasoning {
  reasoning: string
  nextSteps: string[]
}

/** Code Puppy's tool for narrating itself, as the ACP bridge names it. */
export const REASONING_TOOL = 'agent_share_your_reasoning'

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/**
 * What a `agent_share_your_reasoning` call said: its reasoning, and the steps it
 * plans next (the tool takes either one string or a list). Null for any other input.
 */
export function readReasoning(rawInput: unknown): Reasoning | null {
  if (!rawInput || typeof rawInput !== 'object') return null
  const { reasoning, next_steps: steps } = rawInput as Record<string, unknown>
  const nextSteps = (Array.isArray(steps) ? steps : [steps]).map(clean).filter(Boolean)
  const text = clean(reasoning)
  return text || nextSteps.length ? { reasoning: text, nextSteps } : null
}
