import { describe, expect, it } from 'vitest'
import type { RequestPermissionRequest } from '@agentclientprotocol/sdk'
import type { PermissionPrompt } from '@shared/api'
import { PermissionBroker } from './permissionBroker'
import type { PermissionLevel } from '@shared/permissions'

const request = (sessionId: string): RequestPermissionRequest => ({
  sessionId,
  toolCall: { toolCallId: 'tc1', title: 'Run: rm -rf node_modules' },
  options: [
    { optionId: 'allow', name: 'Allow once', kind: 'allow_once' },
    { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
  ],
})

function setup(levels: Record<string, PermissionLevel> = {}) {
  const shown: PermissionPrompt[] = []
  return { shown, broker: new PermissionBroker((prompt) => shown.push(prompt), (sessionId) => levels[sessionId] ?? 'standard') }
}

describe('PermissionBroker at full access', () => {
  it('says yes for that chat without asking, and still asks about every other chat', async () => {
    const { shown, broker } = setup({ loose: 'full', strict: 'ask' })
    expect(await broker.ask(request('loose'))).toEqual({ outcome: { outcome: 'selected', optionId: 'allow' } })
    expect(shown).toEqual([])
    void broker.ask(request('strict'))
    void broker.ask(request('plain'))
    expect(shown.map((prompt) => prompt.sessionId)).toEqual(['strict', 'plain'])
  })

  it('asks after all when there is no yes to give, rather than guessing', () => {
    const { shown, broker } = setup({ loose: 'full' })
    void broker.ask({ ...request('loose'), options: [{ optionId: 'reject', name: 'Reject', kind: 'reject_once' }] })
    expect(shown).toHaveLength(1)
  })

  it('follows the level as it changes', async () => {
    const levels: Record<string, PermissionLevel> = { s: 'full' }
    const { shown, broker } = setup(levels)
    await broker.ask(request('s'))
    levels.s = 'ask'
    void broker.ask(request('s'))
    expect(shown).toHaveLength(1)
  })
})

describe('PermissionBroker', () => {
  it('shows the prompt and resolves with the chosen option', async () => {
    const { shown, broker } = setup()
    const answer = broker.ask(request('s1'))
    expect(shown[0].title).toBe('Run: rm -rf node_modules')
    broker.answer(shown[0].requestId, 'allow')
    expect(await answer).toEqual({ outcome: { outcome: 'selected', optionId: 'allow' } })
  })

  it('treats a dismissed prompt as cancelled, never as allowed', async () => {
    const { shown, broker } = setup()
    const answer = broker.ask(request('s1'))
    broker.answer(shown[0].requestId, null)
    expect(await answer).toEqual({ outcome: { outcome: 'cancelled' } })
  })

  it('cancels only the prompts of the cancelled session', async () => {
    const { shown, broker } = setup()
    const first = broker.ask(request('s1'))
    broker.ask(request('s2'))
    broker.cancelSession('s1')
    expect(await first).toEqual({ outcome: { outcome: 'cancelled' } })
    broker.answer(shown[1].requestId, 'reject')
  })

  it('ignores answers to unknown or already-answered prompts', async () => {
    const { shown, broker } = setup()
    const answer = broker.ask(request('s1'))
    broker.answer(shown[0].requestId, 'reject')
    broker.answer(shown[0].requestId, 'allow')
    broker.answer('nope', 'allow')
    expect(await answer).toEqual({ outcome: { outcome: 'selected', optionId: 'reject' } })
  })
})
