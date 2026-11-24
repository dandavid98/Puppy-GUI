export type DiffLine = { type: 'context' | 'removed' | 'added'; text: string }

const CONTEXT = 2

/**
 * A compact single-hunk diff: trim the lines both versions share at the top
 * and bottom, show what changed in between, plus a little context. Good for
 * the typical agent edit without pulling in a full diff library.
 */
export function compactDiff(oldText: string | null | undefined, newText: string): DiffLine[] {
  const before = oldText ? oldText.split('\n') : []
  const after = newText.split('\n')

  let head = 0
  while (head < before.length && head < after.length && before[head] === after[head]) head++
  let tail = 0
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) tail++

  const context = (lines: string[]): DiffLine[] => lines.map((text) => ({ type: 'context', text }))
  return [
    ...context(before.slice(Math.max(0, head - CONTEXT), head)),
    ...before.slice(head, before.length - tail).map((text): DiffLine => ({ type: 'removed', text })),
    ...after.slice(head, after.length - tail).map((text): DiffLine => ({ type: 'added', text })),
    ...context(after.slice(after.length - tail, after.length - tail + CONTEXT)),
  ]
}
