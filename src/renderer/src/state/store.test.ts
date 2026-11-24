import type { SessionNotification } from '@agentclientprotocol/sdk'
import type { OpenedSession, Settings } from '@shared/api'
import { describe, expect, it } from 'vitest'
import { initialState, reducer, type Action, type AppState } from './store'

const settings = (autoPreview: boolean): Settings => ({ theme: 'system', displayName: 'Dan', smartTitles: true, autoPreview })
const session: OpenedSession = { sessionId: 's1', cwd: '/work/app', kind: 'code', configOptions: [] }

const run = (state: AppState, ...actions: Action[]) => actions.reduce(reducer, state)
const update = (u: SessionNotification['update']): Action => ({ type: 'update', notification: { sessionId: 's1', update: u } })

const wroteHtml = (status: 'in_progress' | 'completed' = 'completed') =>
  update({
    sessionUpdate: 'tool_call_update',
    toolCallId: 'c1',
    status,
    content: [{ type: 'diff', path: 'index.html', oldText: null, newText: '<h1>hi</h1>' }],
  })
const startWrite = update({ sessionUpdate: 'tool_call', toolCallId: 'c1', title: 'Create index.html', kind: 'edit', status: 'in_progress' })

/** A live conversation on screen, auto-preview on unless stated. */
const live = (autoPreview = true, replaying = false): AppState =>
  run(
    { ...initialState, settings: settings(autoPreview) },
    { type: 'opened', session, replaying },
  )

describe('auto preview of files', () => {
  it('opens a page the moment its write completes, not before', () => {
    const writing = run(live(), startWrite, wroteHtml('in_progress'))
    expect(writing.preview).toBeNull()
    const done = run(writing, wroteHtml())
    expect(done.preview).toMatchObject({ kind: 'file', location: '/work/app/index.html' })
  })

  it('reloads the panel when the same page is written again', () => {
    const first = run(live(), startWrite, wroteHtml())
    const again = run(first, { type: 'sent', sessionId: 's1', text: 'tweak it', attachments: [] }, update({ ...{ sessionUpdate: 'tool_call' as const }, toolCallId: 'c2', title: 'Edit index.html', kind: 'edit', status: 'completed', content: [{ type: 'diff', path: 'index.html', oldText: 'a', newText: 'b' }] }))
    expect(again.preview?.location).toBe('/work/app/index.html')
    expect(again.previewRevision).toBeGreaterThan(first.previewRevision)
  })

  it('does nothing when the setting is off', () => {
    expect(run(live(false), startWrite, wroteHtml()).preview).toBeNull()
  })

  it('does nothing while a saved conversation replays, and works again afterwards', () => {
    const replaying = run(live(true, true), startWrite, wroteHtml())
    expect(replaying.preview).toBeNull()
    const afterReplay = run(replaying, { type: 'replayed', sessionId: 's1' }, update({ sessionUpdate: 'tool_call', toolCallId: 'c9', title: 'Create b.html', kind: 'edit', status: 'completed', content: [{ type: 'diff', path: 'b.html', oldText: null, newText: 'x' }] }))
    expect(afterReplay.preview?.location).toBe('/work/app/b.html')
  })

  it('stays quiet for a conversation that is not on screen, or while in Settings', () => {
    expect(run(live(), { type: 'activate', sessionId: null }, startWrite, wroteHtml()).preview).toBeNull()
    expect(run(live(), { type: 'view', view: 'settings' }, startWrite, wroteHtml()).preview).toBeNull()
  })

  it('does not open pages that were only read', () => {
    const read = update({ sessionUpdate: 'tool_call', toolCallId: 'r1', title: 'Read index.html', kind: 'read', status: 'completed', rawInput: { file_path: 'index.html' } })
    expect(run(live(), read).preview).toBeNull()
  })
})

describe('auto preview of local servers', () => {
  const serverReply = (text: string): Action[] => [
    update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } }),
    { type: 'finished', sessionId: 's1' },
  ]

  it('queues a server the reply mentions once the turn finishes', () => {
    const state = run(live(), { type: 'sent', sessionId: 's1', text: 'serve it', attachments: [] }, ...serverReply('It is up at http://localhost:8080/.'))
    expect(state.pendingUrl).toBe('http://localhost:8080/')
  })

  it('offers each server only once per conversation', () => {
    const first = run(live(), ...serverReply('Running at http://localhost:8080'))
    const handled = run(first, { type: 'pendingUrlHandled' })
    const second = run(handled, { type: 'sent', sessionId: 's1', text: 'again', attachments: [] }, ...serverReply('Still at http://localhost:8080'))
    expect(second.pendingUrl).toBeNull()
  })

  it('queues a server a shell command printed', () => {
    const state = run(
      live(),
      update({ sessionUpdate: 'tool_call', toolCallId: 'x1', title: 'Run: npm run dev', kind: 'execute', status: 'in_progress', rawInput: { command: 'npm run dev' } }),
      update({ sessionUpdate: 'tool_call_update', toolCallId: 'x1', status: 'completed', rawOutput: 'ready on http://localhost:5173/' }),
    )
    expect(state.pendingUrl).toBe('http://localhost:5173/')
  })

  it('ignores servers when the setting is off or the turn failed', () => {
    expect(run(live(false), ...serverReply('http://localhost:8080')).pendingUrl).toBeNull()
    const failed = run(live(), update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'http://localhost:8080' } }), { type: 'finished', sessionId: 's1', error: 'boom' })
    expect(failed.pendingUrl).toBeNull()
  })
})

describe('turn bookkeeping', () => {
  it('records the context size a finished turn reports, and keeps it if a turn reports none', () => {
    const counted = run(live(), { type: 'finished', sessionId: 's1', contextTokens: 19_090 })
    expect(counted.threads.s1.contextTokens).toBe(19_090)
    expect(run(counted, { type: 'finished', sessionId: 's1' }).threads.s1.contextTokens).toBe(19_090)
  })

  it('starts a reopened conversation from its saved context size', () => {
    const reopened = run(initialState, { type: 'opened', session, contextTokens: 42_000, replaying: true })
    expect(reopened.threads.s1).toMatchObject({ contextTokens: 42_000, replaying: true })
  })
})

describe('folders', () => {
  it('are kept apart from the conversation list, and a removed conversation leaves them alone', () => {
    const folders = [{ id: 'f1', name: 'Recipes', kind: 'chat' as const, pinned: true, collapsed: false }]
    const filed = { sessionId: 's1', cwd: '/', kind: 'chat' as const, title: 'x', updatedAt: null, contextTokens: null, pinned: false, folderId: 'f1' }
    const loaded = run(initialState, { type: 'folders', folders }, { type: 'sessions', sessions: [filed] })
    expect(loaded.folders).toEqual(folders)
    const after = run(loaded, { type: 'removed', sessionId: 's1' })
    expect(after.sessions).toEqual([])
    expect(after.folders).toEqual(folders)
  })
})
