import { describe, expect, it } from 'vitest'
import { latestReply, previewForCompletedCall, previewForReply } from './autoPreview'
import type { ThreadItem, ToolCallView } from './thread'

const call = (patch: Partial<ToolCallView>): ToolCallView => ({ toolCallId: 't', title: 'x', content: [], status: 'completed', ...patch })

describe('previewForCompletedCall', () => {
  it('shows a page the agent wrote', () => {
    const created = call({ kind: 'edit', content: [{ type: 'diff', path: 'site/index.html', oldText: null, newText: '<h1/>' }] })
    expect(previewForCompletedCall(created, '/work/app')).toMatchObject({ file: { kind: 'file', location: '/work/app/site/index.html' }, urls: [] })
  })

  it('does not open a page the agent only read', () => {
    const read = call({ kind: 'read', rawInput: { file_path: 'index.html' } })
    expect(previewForCompletedCall(read, '/work/app')).toEqual({ urls: [] })
  })

  it('ignores edits to files that are not previewable', () => {
    const edit = call({ kind: 'edit', content: [{ type: 'diff', path: 'main.py', oldText: 'a', newText: 'b' }] })
    expect(previewForCompletedCall(edit, '/work/app').file).toBeUndefined()
  })

  it('queues a local server a command printed, even through colour codes and JSON escaping', () => {
    const serve = call({ kind: 'execute', rawInput: { command: 'npm run dev' }, rawOutput: { stdout: '  Local:   \u001b[36mhttp://localhost:\u001b[1m5173\u001b[22m/\n' } })
    expect(previewForCompletedCall(serve, '/w').urls).toEqual(['http://localhost:5173/'])
    const escaped = call({ kind: 'execute', rawInput: { command: 'npm run dev' }, rawOutput: 'stdout=\'\\u001b[36mhttp://localhost:\\u001b[1m3000\\u001b[22m/\\nready\'' })
    expect(previewForCompletedCall(escaped, '/w').urls).toEqual(['http://localhost:3000/'])
  })

  it('treats 0.0.0.0 as localhost', () => {
    const serve = call({ kind: 'execute', rawInput: { command: 'python3 -m http.server 8000' }, rawOutput: 'Serving HTTP on 0.0.0.0 port 8000 (http://0.0.0.0:8000/) ...' })
    expect(previewForCompletedCall(serve, '/w').urls).toEqual(['http://localhost:8000/'])
  })

  it('ignores URLs that were only part of the command', () => {
    const probe = call({ kind: 'execute', rawInput: { command: 'curl -s http://localhost:8000/health' }, rawOutput: "command='curl -s http://localhost:8000/health' stdout='ok'" })
    expect(previewForCompletedCall(probe, '/w').urls).toEqual([])
  })

  it('ignores other tool kinds', () => {
    expect(previewForCompletedCall(call({ kind: 'search', rawOutput: 'http://localhost:1234/' }), '/w')).toEqual({ urls: [] })
  })
})

describe('previewForReply', () => {
  const items: ThreadItem[] = [
    { type: 'user', id: 'u0', text: 'old question http://localhost:1111' },
    { type: 'assistant', id: 'a0', text: 'old answer at http://localhost:2222' },
    { type: 'user', id: 'u1', text: 'start the server' },
    { type: 'assistant', id: 'a1', text: 'Done! It is running at http://localhost:8080/app, open it.' },
  ]

  it('only looks at the latest reply', () => {
    expect(latestReply(items)).toContain('8080')
    expect(previewForReply(items).urls).toEqual(['http://localhost:8080/app'])
  })

  it('strips trailing punctuation and ignores non-local addresses', () => {
    const reply: ThreadItem[] = [{ type: 'assistant', id: 'a', text: 'Try http://localhost:3000. Docs: https://example.com:8080/x and http://localhost.evil.com:3000' }]
    expect(previewForReply(reply).urls).toEqual(['http://localhost:3000'])
  })

  it('finds nothing when there is no reply yet', () => {
    expect(previewForReply([{ type: 'user', id: 'u', text: 'hi' }]).urls).toEqual([])
  })
})
