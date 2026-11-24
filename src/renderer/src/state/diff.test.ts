import { describe, expect, it } from 'vitest'
import { compactDiff } from './diff'

describe('compactDiff', () => {
  it('shows only the changed lines plus context', () => {
    const before = ['a', 'b', 'c', 'd', 'e', 'f'].join('\n')
    const after = ['a', 'b', 'c', 'X', 'e', 'f'].join('\n')
    expect(compactDiff(before, after)).toEqual([
      { type: 'context', text: 'b' },
      { type: 'context', text: 'c' },
      { type: 'removed', text: 'd' },
      { type: 'added', text: 'X' },
      { type: 'context', text: 'e' },
      { type: 'context', text: 'f' },
    ])
  })

  it('treats a brand-new file as all additions', () => {
    expect(compactDiff(null, 'one\ntwo')).toEqual([
      { type: 'added', text: 'one' },
      { type: 'added', text: 'two' },
    ])
  })

  it('handles pure insertions without inventing removals', () => {
    const diff = compactDiff('a\nc', 'a\nb\nc')
    expect(diff.filter((line) => line.type !== 'context')).toEqual([{ type: 'added', text: 'b' }])
  })
})
