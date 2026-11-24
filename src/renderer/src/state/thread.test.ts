import { describe, expect, it } from 'vitest'
import type { SessionUpdate } from '@agentclientprotocol/sdk'
import { addUserMessage, applyUpdate, type ThreadItem } from './thread'

const text = (sessionUpdate: 'agent_message_chunk' | 'agent_thought_chunk' | 'user_message_chunk', value: string) =>
  ({ sessionUpdate, content: { type: 'text', text: value } }) as SessionUpdate

const fold = (updates: SessionUpdate[], start: ThreadItem[] = []) => updates.reduce(applyUpdate, start)

describe('applyUpdate', () => {
  it('streams consecutive chunks into one assistant message', () => {
    const items = fold([text('agent_message_chunk', 'Hel'), text('agent_message_chunk', 'lo')])
    expect(items).toEqual([{ type: 'assistant', id: 'assistant-0', text: 'Hello' }])
  })

  it('starts a new message when the speaker changes', () => {
    const items = fold([text('agent_thought_chunk', 'hmm'), text('agent_message_chunk', 'ok')])
    expect(items.map((item) => item.type)).toEqual(['thought', 'assistant'])
  })

  it('rebuilds user turns when a saved session is replayed', () => {
    const items = fold([text('user_message_chunk', 'hi'), text('agent_message_chunk', 'hey')])
    expect(items.map((item) => item.type)).toEqual(['user', 'assistant'])
  })

  it('opens a tool call and merges later updates without losing fields', () => {
    const items = fold([
      { sessionUpdate: 'tool_call', toolCallId: 'tc1', title: 'Run: echo hi', kind: 'execute', status: 'in_progress' },
      { sessionUpdate: 'tool_call_update', toolCallId: 'tc1', status: 'completed', title: null, rawOutput: 'hi' },
    ])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      type: 'tool',
      call: { toolCallId: 'tc1', title: 'Run: echo hi', kind: 'execute', status: 'completed', rawOutput: 'hi' },
    })
  })

  it('keeps assistant text on either side of a tool call separate', () => {
    const items = fold([
      text('agent_message_chunk', 'Let me check.'),
      { sessionUpdate: 'tool_call', toolCallId: 'tc1', title: 'Read a.py' },
      text('agent_message_chunk', 'Done.'),
    ])
    expect(items.map((item) => item.type)).toEqual(['assistant', 'tool', 'assistant'])
  })

  it('ignores updates the UI does not render', () => {
    const items = addUserMessage([], 'hi')
    const update = { sessionUpdate: 'available_commands_update', availableCommands: [] } as SessionUpdate
    expect(applyUpdate(items, update)).toBe(items)
  })
})
