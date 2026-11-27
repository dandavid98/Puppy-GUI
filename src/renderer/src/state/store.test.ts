import type { SessionNotification } from '@agentclientprotocol/sdk'
import type { Attachment, OpenedSession, SessionSummary, Settings } from '@shared/api'
import { describe, expect, it } from 'vitest'
import { initialState, reducer, type Action, type AppState } from './store'

const settings = (autoPreview: boolean): Settings => ({ theme: 'system', displayName: 'Dan', smartTitles: true, autoPreview, thinkingMode: false, defaultAgent: null })
const session: OpenedSession = { sessionId: 's1', cwd: '/work/app', kind: 'code', configOptions: [] }

const AT = '2026-11-25T10:00:00.000Z'
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
    const again = run(first, { type: 'sent', sessionId: 's1', text: 'tweak it', attachments: [], at: AT }, update({ ...{ sessionUpdate: 'tool_call' as const }, toolCallId: 'c2', title: 'Edit index.html', kind: 'edit', status: 'completed', content: [{ type: 'diff', path: 'index.html', oldText: 'a', newText: 'b' }] }))
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
    const state = run(live(), { type: 'sent', sessionId: 's1', text: 'serve it', attachments: [], at: AT }, ...serverReply('It is up at http://localhost:8080/.'))
    expect(state.pendingUrl).toBe('http://localhost:8080/')
  })

  it('offers each server only once per conversation', () => {
    const first = run(live(), ...serverReply('Running at http://localhost:8080'))
    const handled = run(first, { type: 'pendingUrlHandled' })
    const second = run(handled, { type: 'sent', sessionId: 's1', text: 'again', attachments: [], at: AT }, ...serverReply('Still at http://localhost:8080'))
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

describe('update badge', () => {
  it('is hidden until the main process says an update is waiting, and clears again', () => {
    expect(initialState.updateAvailable).toBe(false)
    const waiting = run(initialState, { type: 'updateAvailable', available: true })
    expect(waiting.updateAvailable).toBe(true)
    expect(run(waiting, { type: 'updateAvailable', available: false }).updateAvailable).toBe(false)
  })
})

describe('vpn status', () => {
  it('starts out unknown, then follows what the main process reports', () => {
    expect(initialState.vpn).toBe('unknown')
    const off = run(initialState, { type: 'vpn', status: 'disconnected' })
    expect(off.vpn).toBe('disconnected')
    expect(run(off, { type: 'vpn', status: 'connected' }).vpn).toBe('connected')
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

describe('the sidebar row of a conversation', () => {
  const summary = (id: string, title: string): SessionSummary => ({
    sessionId: id, cwd: '/work/app', kind: 'code', title, updatedAt: AT, contextTokens: null, pinned: false, folderId: null,
  })
  const send = (text: string, attachments: Attachment[] = []): Action => ({ type: 'sent', sessionId: 's1', text, attachments, at: AT })
  const fresh = () => run(initialState, { type: 'opened', session })

  it('appears the moment the first message is sent, titled from it', () => {
    const state = run(fresh(), send('Write me a poem about puppies\nwith a second line'))
    expect(state.sessions).toEqual([{ ...summary('s1', 'Write me a poem about puppies') }])
  })

  it('is titled from the attachments when there is no text', () => {
    const image: Attachment = { kind: 'text', name: 'notes.txt', mimeType: 'text/plain', text: 'x' }
    expect(run(fresh(), send('  ', [image])).sessions[0].title).toBe('notes.txt')
  })

  it('is added once, and never for a conversation the list already has', () => {
    const twice = run(fresh(), send('first'), send('second'))
    expect(twice.sessions).toHaveLength(1)
    const listed = run(fresh(), { type: 'sessions', sessions: [summary('s1', 'Saved title')] }, send('hello'))
    expect(listed.sessions).toEqual([summary('s1', 'Saved title')])
  })

  it('is replaced by the real list entry, not duplicated', () => {
    const state = run(fresh(), send('first'), { type: 'sessions', sessions: [summary('s1', 'Smart title')] })
    expect(state.sessions).toEqual([summary('s1', 'Smart title')])
  })

  it('survives a list that leaves out an open conversation (not saved yet, or the list failed to include it)', () => {
    const state = run(fresh(), send('first'), { type: 'sessions', sessions: [summary('other', 'Other')] })
    expect(state.sessions.map((row) => row.sessionId)).toEqual(['s1', 'other'])
  })

  it('does not keep rows for conversations that are not open, and goes when the conversation is deleted', () => {
    const state = run(initialState, { type: 'sessions', sessions: [summary('old', 'Old')] }, { type: 'sessions', sessions: [] })
    expect(state.sessions).toEqual([])
    expect(run(fresh(), send('first'), { type: 'removed', sessionId: 's1' }).sessions).toEqual([])
  })
})

describe('asking for an agent', () => {
  it('opens a new chat with the text in the box, from anywhere', () => {
    const fromCode = run(initialState, { type: 'opened', session }, { type: 'view', view: 'agents' }, { type: 'ask', text: 'Ask the QA Kitten agent to ' })
    expect(fromCode).toMatchObject({ mode: 'chat', activeId: null, view: 'conversation', draft: { text: 'Ask the QA Kitten agent to ', id: 1 } })
  })

  it('tells a repeat of the same request apart, so the box fills again', () => {
    const twice = run(initialState, { type: 'ask', text: 'same' }, { type: 'ask', text: 'same' })
    expect(twice.draft).toEqual({ text: 'same', id: 2 })
  })
})
