import { EventEmitter } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ContentBlock, PromptResponse, SessionNotification } from '@agentclientprotocol/sdk'
import { describe, expect, it } from 'vitest'
import type { ModelFallbackSettings, ModelSwitch } from '@shared/api'
import { RUN_FAILED } from '@shared/usageLimit'
import type { AgentPool } from './acp/agentPool'
import { ModelFallback, RETRY_NOTE } from './modelFallback'
import { SessionIndex } from './sessionIndex'
import type { SettingsStore } from './settings'
import { Workspace } from './workspace'

const OPUS = 'claude-opus-5-5'
const SONNET = 'claude-sonnet-5-5'
const ON: ModelFallbackSettings = { enabled: true, main: OPUS, secondary: SONNET }

/** What Code Puppy streams when the gateway says Opus is spent (word for word from its error log). */
const OPUS_SPENT = `${RUN_FAILED}: status_code: 402, model_name: ${OPUS}, body: {'error': {'message': "Large-model token quota exceeded for job family 'DATA ANALYTICS'. Used 25218996/25000000 large-model tokens this period. Try again in 173 minutes.", 'type': 'rate_limit_error'}}`
const SONNET_SPENT = `${RUN_FAILED}: status_code: 402, model_name: ${SONNET}, body: {'error': {'message': "Token quota exceeded for job family 'DATA ANALYTICS'. Used 1/1 tokens this period.", 'type': 'rate_limit_error'}}`

type Turn = { says?: string; usesTool?: boolean; stopReason: PromptResponse['stopReason'] }

/**
 * A Code Puppy that works through `turns` in order, one per prompt: it streams what the turn says
 * (and starts a tool, if the turn uses one), then answers with the turn's stop reason.
 */
function setup({ settings = ON, model = OPUS, turns, switchFails = false }: { settings?: ModelFallbackSettings; model?: string; turns: Turn[]; switchFails?: boolean }) {
  const dir = mkdtempSync(join(tmpdir(), 'puppy-fallback-'))
  const pool = new EventEmitter()
  const toWindow: SessionNotification[] = []
  const prompts: ContentBlock[][] = []
  const switches: ModelSwitch[] = []
  let active = model
  let created = 0
  const modelOptions = () => [{ id: 'model', name: 'Model', type: 'select' as const, currentValue: active, options: [] }]
  const say = (sessionId: string, text: string) => pool.emit('sessionUpdate', { sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } })

  const context = {
    request: async (method: string, params: Record<string, unknown>) => {
      if (method === 'session/new') return { sessionId: `s${++created}`, configOptions: modelOptions() }
      if (method === 'session/set_config_option') {
        if (switchFails) throw new Error('no such model')
        active = params.value as string
        return { configOptions: modelOptions() }
      }
      if (method === 'session/prompt') {
        const sessionId = params.sessionId as string
        prompts.push(params.prompt as ContentBlock[])
        const turn = turns[prompts.length - 1]
        if (turn.usesTool) pool.emit('sessionUpdate', { sessionId, update: { sessionUpdate: 'tool_call', toolCallId: `t${prompts.length}`, title: 'Edit a.txt' } })
        if (turn.says) say(sessionId, turn.says)
        return { stopReason: turn.stopReason }
      }
      return {}
    },
    notify: async () => undefined,
  }
  Object.assign(pool, { forFolder: () => ({ context: async () => context }), cancelPermissions: () => undefined })

  const fallback = new ModelFallback(() => settings, () => workspace.model, (notification) => toWindow.push(notification))
  pool.on('sessionUpdate', (notification: SessionNotification) => fallback.route(notification))
  const workspace: Workspace = new Workspace(
    pool as unknown as AgentPool,
    new SessionIndex(join(dir, 'sessions.json')),
    { get: () => ({ smartTitles: false }) } as unknown as SettingsStore,
    join(dir, 'chats'),
    () => ({}),
    async () => [],
    undefined,
    fallback,
  )
  workspace.on('modelSwitched', (change) => switches.push(change))
  return { workspace, toWindow, prompts, switches, activeModel: () => active, text: (n: number) => (prompts[n].at(-1) as { text: string }).text }
}

/** A chat that has already told the app which model it is on (the way the model list does at startup). */
async function startChat(env: ReturnType<typeof setup>): Promise<string> {
  await env.workspace.configOptions()
  return (await env.workspace.create('chat')).sessionId
}

const heard = (env: ReturnType<typeof setup>) => env.toWindow.flatMap(({ update }) => (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text' ? [update.content.text] : []))

describe('a turn that runs into the main model\'s usage limit', () => {
  it('carries on with the secondary model, and the window never sees the error', async () => {
    const env = setup({ turns: [{ says: OPUS_SPENT, stopReason: 'refusal' }, { says: 'Done.', stopReason: 'end_turn' }] })
    const sessionId = await startChat(env)

    const result = await env.workspace.prompt(sessionId, 'Please tidy the readme.')

    expect(result.stopReason).toBe('end_turn')
    expect(env.activeModel()).toBe(SONNET)
    expect(env.workspace.model).toBe(SONNET)
    expect(env.switches).toHaveLength(1)
    expect(env.switches[0]).toMatchObject({ sessionId, from: OPUS, to: SONNET })
    expect(env.switches[0].configOptions[0]).toMatchObject({ currentValue: SONNET }) // so the picker can show it
    expect(heard(env)).toEqual(['Done.'])
    expect(env.prompts).toHaveLength(2)
    expect(env.text(1)).toBe('Please tidy the readme.') // the same request, asked again
  })

  it('tells the new model that some of the work may already be done, when the first try had used tools', async () => {
    const env = setup({ turns: [{ usesTool: true, says: OPUS_SPENT, stopReason: 'refusal' }, { stopReason: 'end_turn' }] })
    await env.workspace.prompt(await startChat(env), 'Rename the helper everywhere.')
    expect(env.prompts[1]).toHaveLength(env.prompts[0].length + 1)
    expect(env.text(1)).toBe(RETRY_NOTE)
    expect(env.prompts[1][0]).toEqual(env.prompts[0][0]) // the user's own words, untouched
  })

  it('gives the user the error as usual when the secondary model cannot be switched to', async () => {
    const env = setup({ switchFails: true, turns: [{ says: OPUS_SPENT, stopReason: 'refusal' }] })
    const result = await env.workspace.prompt(await startChat(env), 'Hello')
    expect(result.stopReason).toBe('refusal')
    expect(heard(env)).toEqual([OPUS_SPENT])
    expect(env.prompts).toHaveLength(1)
    expect(env.switches).toEqual([])
    expect(env.workspace.model).toBe(OPUS)
  })

  it('shows the second limit, and stops, when the secondary model is spent too', async () => {
    const env = setup({ turns: [{ says: OPUS_SPENT, stopReason: 'refusal' }, { says: SONNET_SPENT, stopReason: 'refusal' }] })
    const result = await env.workspace.prompt(await startChat(env), 'Hello')
    expect(result.stopReason).toBe('refusal')
    expect(heard(env)).toEqual([SONNET_SPENT])
    expect(env.prompts).toHaveLength(2) // no third try, no ping-pong back to Opus
    expect(env.workspace.model).toBe(SONNET)
  })

  it('stays on the secondary model for the next message, without asking Opus again', async () => {
    const env = setup({ turns: [{ says: OPUS_SPENT, stopReason: 'refusal' }, { stopReason: 'end_turn' }, { says: SONNET_SPENT, stopReason: 'refusal' }] })
    const sessionId = await startChat(env)
    await env.workspace.prompt(sessionId, 'one')
    await env.workspace.prompt(sessionId, 'two')
    expect(heard(env)).toEqual([SONNET_SPENT]) // and, from Sonnet, it is shown rather than swapped back
    expect(env.switches).toHaveLength(1)
  })
})

describe('when it should not switch', () => {
  const blocked: Turn[] = [{ says: OPUS_SPENT, stopReason: 'refusal' }]

  it('does nothing unless the user turned it on and chose both models', async () => {
    for (const settings of [{ ...ON, enabled: false }, { ...ON, secondary: null }, { ...ON, main: null }]) {
      const env = setup({ settings, turns: blocked })
      const result = await env.workspace.prompt(await startChat(env), 'Hello')
      expect(result.stopReason).toBe('refusal')
      expect(heard(env)).toEqual([OPUS_SPENT])
      expect(env.prompts).toHaveLength(1)
      expect(env.switches).toEqual([])
    }
  })

  it('does nothing when the chat is not on the main model', async () => {
    const env = setup({ model: 'gpt-5.6-sol', turns: blocked })
    await env.workspace.prompt(await startChat(env), 'Hello')
    expect(heard(env)).toEqual([OPUS_SPENT])
    expect(env.prompts).toHaveLength(1)
  })

  it('does nothing for a failure that is not a spent quota', async () => {
    const env = setup({ turns: [{ says: `${RUN_FAILED}: Connection error.`, stopReason: 'refusal' }] })
    await env.workspace.prompt(await startChat(env), 'Hello')
    expect(heard(env)).toEqual([`${RUN_FAILED}: Connection error.`])
    expect(env.prompts).toHaveLength(1)
    expect(env.switches).toEqual([])
  })
})
