import type { SessionNotification } from '@agentclientprotocol/sdk'
import { describe, expect, it } from 'vitest'
import type { ModelFallbackSettings } from '@shared/api'
import { RUN_FAILED } from '@shared/usageLimit'
import { ModelFallback } from './modelFallback'

const ON: ModelFallbackSettings = { enabled: true, main: 'claude-opus-5-5', secondary: 'claude-sonnet-5-5' }
const say = (sessionId: string, text: string): SessionNotification => ({ sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } })
const blocked = (sessionId = 's1', limit = 'Large-model token quota exceeded') => say(sessionId, `${RUN_FAILED}: ${limit}`)

function setup(settings: ModelFallbackSettings = ON, model: string | null = ON.main) {
  const state = { settings, model }
  const forwarded: SessionNotification[] = []
  const fallback = new ModelFallback(() => state.settings, () => state.model, (n) => forwarded.push(n))
  return { fallback, forwarded, state }
}

describe('ModelFallback', () => {
  it('passes ordinary updates straight on', () => {
    const { fallback, forwarded } = setup()
    const hello = say('s1', 'Hello there')
    fallback.route(hello)
    expect(forwarded).toEqual([hello])
  })

  it('holds a spent-quota notice from the main model, and hands over the plan for it', () => {
    const { fallback, forwarded } = setup()
    fallback.route(blocked())
    expect(forwarded).toEqual([]) // the window does not see an error for a turn about to carry on
    expect(fallback.take('s1')?.plan).toEqual({ from: 'claude-opus-5-5', to: 'claude-sonnet-5-5' })
    expect(fallback.take('s1')).toBeNull() // once
  })

  it('gives the notice back untouched if the switch cannot be made', () => {
    const { fallback, forwarded } = setup()
    const notice = blocked()
    fallback.route(notice)
    fallback.take('s1')?.giveBack()
    expect(forwarded).toEqual([notice])
  })

  it('keeps each chat to itself', () => {
    const { fallback, forwarded } = setup()
    fallback.route(blocked('a'))
    expect(fallback.take('b')).toBeNull()
    fallback.route(say('b', 'hi'))
    expect(forwarded).toHaveLength(1)
    expect(fallback.take('a')).not.toBeNull()
  })

  it('does nothing while the feature is off or half set up', () => {
    for (const settings of [{ ...ON, enabled: false }, { ...ON, secondary: null }, { ...ON, main: null }, { ...ON, secondary: ON.main }]) {
      const { fallback, forwarded } = setup(settings)
      const notice = blocked()
      fallback.route(notice)
      expect(forwarded).toEqual([notice])
      expect(fallback.take('s1')).toBeNull()
    }
  })

  it('only steps in from the main model: not from the secondary (no ping-pong), nor from any other', () => {
    for (const model of [ON.secondary, 'gpt-5.6-sol', null]) {
      const { fallback, forwarded } = setup(ON, model)
      const notice = blocked()
      fallback.route(notice)
      expect(forwarded).toEqual([notice])
      expect(fallback.take('s1')).toBeNull()
    }
  })

  it('follows the model as the user changes it', () => {
    const { fallback, forwarded, state } = setup(ON, 'gpt-5.6-sol')
    fallback.route(blocked())
    expect(forwarded).toHaveLength(1)
    state.model = ON.main
    fallback.route(blocked())
    expect(forwarded).toHaveLength(1) // held this time
  })

  it('does not switch for the request limit (shared by every model), a passing overload, or an unrelated error', () => {
    for (const detail of ['Request limit exceeded', 'Overloaded, try again', 'Connection reset']) {
      const { fallback, forwarded } = setup()
      const notice = blocked('s1', detail)
      fallback.route(notice)
      expect(forwarded).toEqual([notice])
    }
  })

  it('does not take the model\'s own words about quotas for a block', () => {
    const { fallback, forwarded } = setup()
    const chat = say('s1', 'Large-model token quota exceeded is what the gateway says when you run out.')
    fallback.route(chat)
    expect(forwarded).toEqual([chat])
  })

  it('lets go of a held notice for a chat that is gone', () => {
    const { fallback } = setup()
    fallback.route(blocked())
    fallback.forget('s1')
    expect(fallback.take('s1')).toBeNull()
  })
})
