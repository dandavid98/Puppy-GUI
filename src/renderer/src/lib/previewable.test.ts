import { describe, expect, it } from 'vitest'
import type { ToolCallView } from '../state/thread'
import { previewablePaths } from './previewable'

const call = (patch: Partial<ToolCallView>): ToolCallView => ({ toolCallId: 't', title: 'x', content: [], ...patch })

describe('previewablePaths', () => {
  it('finds an HTML file from a diff and resolves it against the project folder', () => {
    const edit = call({ content: [{ type: 'diff', path: 'report.html', oldText: null, newText: '<h1/>' }] })
    expect(previewablePaths(edit, '/work/app/')).toEqual(['/work/app/report.html'])
  })

  it('keeps absolute paths and de-duplicates across sources', () => {
    const edit = call({
      locations: [{ path: '/work/app/report.html' }],
      rawInput: { file_path: '/work/app/report.html' },
    })
    expect(previewablePaths(edit, '/work/app')).toEqual(['/work/app/report.html'])
  })

  it('ignores files that are not previewable', () => {
    expect(previewablePaths(call({ rawInput: { file_path: 'main.py' } }), '/work/app')).toEqual([])
  })
})
