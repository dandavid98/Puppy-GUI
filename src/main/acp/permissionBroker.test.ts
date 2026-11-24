import { describe, expect, it } from 'vitest'
import type { RequestPermissionRequest } from '@agentclientprotocol/sdk'
import type { PermissionPrompt } from '@shared/api'
import { PermissionBroker } from './permissionBroker'

const request = (sessionId: string): RequestPermissionRequest => ({
  sessionId,
  toolCall: { toolCallId: 'tc1', title: 'Run: rm -rf node_modules' },
  options: [
    { optionId: 'allow', name: 'Allow once', kind: 'allow_once' },
    { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
  ],
})

function setup() {
  const shown: PermissionPrompt[] = []
  return { shown, broker: new PermissionBroker((prompt) => shown.push(prompt)) }
}

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
