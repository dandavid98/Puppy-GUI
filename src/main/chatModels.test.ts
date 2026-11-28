import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CHAT_MODEL_OPTION, ChatModels, confirmedModel, DEFAULT_MODEL_OPTION, type OptionAnswer } from './chatModels'
import { SessionIndex } from './sessionIndex'

const OPUS = 'claude-opus-5-5'
const SOL = 'gpt-5.6-sol'
const options = (model: string) => [{ id: DEFAULT_MODEL_OPTION, name: 'Model', type: 'select' as const, currentValue: model, options: [] }]

/** Code Puppy as ChatModels sees it: processes with one model each, and (with the bootstrap) chats with their own. */
function setup({ bootstrap = true, processes = ['home', 'project'] } = {}) {
  const index = new SessionIndex(join(mkdtempSync(join(tmpdir(), 'puppy-models-')), 'sessions.json'))
  const processModels = new Map(processes.map((name) => [name, OPUS]))
  const sent: Array<[string, string, string]> = []
  let unknownModel: string | null = null
  const setOption = async (sessionId: string, configId: string, value: string): Promise<OptionAnswer> => {
    sent.push([sessionId, configId, value])
    if (value === unknownModel) throw new Error(`No such model: ${value}`)
    if (configId === DEFAULT_MODEL_OPTION) processModels.set(sessionId.replace('scratch-', ''), value)
    if (configId === CHAT_MODEL_OPTION && bootstrap) return { configOptions: options(OPUS), _meta: { puppy: { model: value } } }
    return { configOptions: options(processModels.get('home')!) }
  }
  const inEveryProcess = async <T,>(use: (scratchId: string) => Promise<T>) => Promise.all(processes.map((name) => use(`scratch-${name}`)))
  const models = new ChatModels(setOption, inEveryProcess, index)
  models.remember(options(OPUS))
  return { models, index, sent, processModels, forget: (model: string) => (unknownModel = model) }
}

describe('ChatModels', () => {
  it('sets the default in every running Code Puppy, since each has a model of its own', async () => {
    const env = setup()
    await env.models.setDefault(SOL)
    expect([...env.processModels.values()]).toEqual([SOL, SOL])
    expect(env.models.default).toBe(SOL)
    expect(env.models.of('a chat that never chose')).toBe(SOL)
  })

  it("gives one chat its own model, saved with it, and leaves the default where it was", async () => {
    const env = setup()
    env.index.create('mine', 'chat')
    await env.models.choose('mine', SOL)
    expect(env.models.of('mine')).toBe(SOL)
    expect(env.models.of('theirs')).toBe(OPUS)
    expect(env.models.default).toBe(OPUS)
    expect(env.sent).toEqual([['mine', CHAT_MODEL_OPTION, SOL]]) // nothing process-wide
    expect(env.index.get('mine')?.model).toBe(SOL)
  })

  it('does not save a switch made for it (a usage limit), so the chat is back on the main model when reopened', async () => {
    const env = setup()
    env.index.create('mine', 'chat')
    await env.models.choose('mine', SOL, { keep: false })
    expect(env.models.of('mine')).toBe(SOL)
    expect(env.index.get('mine')?.model).toBeUndefined()
  })

  it('gives a reopened chat its model back; one that never chose follows the default', async () => {
    const env = setup()
    env.index.create('mine', 'chat')
    env.index.update('mine', { model: SOL })
    env.index.create('plain', 'chat')
    expect(await env.models.restore('mine')).toBe(SOL)
    expect(env.models.of('mine')).toBe(SOL)
    expect(await env.models.restore('plain')).toBeNull()
    expect(env.models.of('plain')).toBe(OPUS)
  })

  it('lets a reopened chat follow the default when its model is gone, keeping the choice for when it is back', async () => {
    const env = setup()
    env.index.create('mine', 'chat')
    env.index.update('mine', { model: SOL })
    env.forget(SOL)
    expect(await env.models.restore('mine')).toBeNull()
    expect(env.models.of('mine')).toBe(OPUS)
    expect(env.index.get('mine')?.model).toBe(SOL)
  })

  it('falls back to changing the one model there is, with a Code Puppy that cannot give a chat its own', async () => {
    const env = setup({ bootstrap: false })
    env.index.create('mine', 'chat')
    await env.models.choose('mine', SOL)
    expect(env.sent.map(([, configId]) => configId)).toEqual([CHAT_MODEL_OPTION, DEFAULT_MODEL_OPTION])
    expect(env.models.of('mine')).toBe(SOL)
    expect(env.models.default).toBe(SOL) // honest: that is what such a Code Puppy did
    expect(env.index.get('mine')?.model).toBeUndefined()
  })

  it('forgets a chat that is gone', async () => {
    const env = setup()
    env.index.create('mine', 'chat')
    await env.models.choose('mine', SOL)
    env.models.forget('mine')
    expect(env.models.of('mine')).toBe(OPUS)
  })
})

describe('confirmedModel', () => {
  it('reads the model the bootstrap says it applied, and nothing from an answer that does not say', () => {
    expect(confirmedModel({ _meta: { puppy: { model: SOL } } })).toBe(SOL)
    expect(confirmedModel({ _meta: { puppy: { model: null } } })).toBeNull()
    expect(confirmedModel({ _meta: { puppy: { permission: 'ask' } } })).toBeUndefined()
    expect(confirmedModel({ configOptions: [] })).toBeUndefined()
  })
})
