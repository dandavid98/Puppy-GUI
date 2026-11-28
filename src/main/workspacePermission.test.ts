import { EventEmitter } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AgentPool } from './acp/agentPool'
import { PermissionLevels } from './acp/permissionLevels'
import { SessionIndex } from './sessionIndex'
import type { SettingsStore } from './settings'
import { Workspace } from './workspace'

interface Call {
  method: string
  params: Record<string, unknown>
}

/** A Code Puppy that is there or not: `echoes` is a Code Puppy with Puppy's bootstrap, which says what level it applied. */
function setup({ echoes }: { echoes: boolean }) {
  const dir = mkdtempSync(join(tmpdir(), 'puppy-permission-'))
  const calls: Call[] = []
  let created = 0
  const context = {
    request: async (method: string, params: Record<string, unknown>) => {
      calls.push({ method, params })
      if (method === 'session/new') return { sessionId: `s${++created}`, configOptions: [] }
      if (method === 'session/set_mode') return echoes ? { _meta: { puppy: { permission: params.modeId } } } : {}
      return { configOptions: [] }
    },
    notify: async () => undefined,
  }
  const pool = Object.assign(new EventEmitter(), { forFolder: () => ({ context: async () => context }), home: { context: async () => context }, cancelPermissions: () => undefined })
  const index = new SessionIndex(join(dir, 'sessions.json'))
  const levels = new PermissionLevels()
  const workspace = new Workspace(pool as unknown as AgentPool, index, { get: () => ({ smartTitles: false }) } as unknown as SettingsStore, join(dir, 'chats'), () => ({}), async () => [], levels)
  return { workspace, index, levels, calls, dir }
}

describe('Workspace permission levels', () => {
  it('starts every chat at standard', async () => {
    const { workspace, levels } = setup({ echoes: true })
    const chat = await workspace.create('chat')
    expect(chat.permission).toBe('standard')
    expect(levels.get(chat.sessionId)).toBe('standard')
  })

  it('applies a level through session/set_mode, then remembers it for the broker and for next time', async () => {
    const { workspace, levels, index, calls } = setup({ echoes: true })
    const { sessionId } = await workspace.create('chat')
    expect(await workspace.setPermissionLevel(sessionId, 'full')).toBe('full')
    expect(calls.find((call) => call.method === 'session/set_mode')?.params).toEqual({ sessionId, modeId: 'full' })
    expect(levels.get(sessionId)).toBe('full')
    expect(index.get(sessionId)?.permission).toBe('full')
    await workspace.setPermissionLevel(sessionId, 'standard')
    expect(levels.get(sessionId)).toBe('standard')
  })

  it('refuses, and changes nothing, when Code Puppy only pretends to take the level', async () => {
    const { workspace, levels, index } = setup({ echoes: false })
    const { sessionId } = await workspace.create('chat')
    for (const level of ['ask', 'full'] as const) {
      await expect(workspace.setPermissionLevel(sessionId, level)).rejects.toThrow("can't change permission levels")
    }
    expect(levels.get(sessionId)).toBe('standard')
    expect(index.get(sessionId)?.permission).toBeUndefined()
    expect(await workspace.setPermissionLevel(sessionId, 'standard')).toBe('standard') // nothing to prove, nothing to apply
  })

  it("gives a reopened chat its level back, and says standard if Code Puppy cannot", async () => {
    const withIt = setup({ echoes: true })
    withIt.index.create('old', 'chat')
    withIt.index.update('old', { permission: 'ask' })
    expect((await withIt.workspace.load('old', withIt.dir)).permission).toBe('ask')
    expect(withIt.levels.get('old')).toBe('ask')

    const without = setup({ echoes: false })
    without.index.create('old', 'chat')
    without.index.update('old', { permission: 'full' })
    expect((await without.workspace.load('old', without.dir)).permission).toBe('standard')
    expect(without.levels.get('old')).toBe('standard')
    expect(without.index.get('old')?.permission).toBe('standard')
  })

  it('does not bother Code Puppy when a reopened chat is already standard', async () => {
    const { workspace, index, calls, dir } = setup({ echoes: true })
    index.create('plain', 'chat')
    expect((await workspace.load('plain', dir)).permission).toBe('standard')
    expect(calls.some((call) => call.method === 'session/set_mode')).toBe(false)
  })

  it('forgets a chat that is deleted', async () => {
    const { workspace, levels } = setup({ echoes: true })
    const { sessionId } = await workspace.create('chat')
    await workspace.setPermissionLevel(sessionId, 'ask')
    await workspace.remove(sessionId)
    expect(levels.get(sessionId)).toBe('standard')
  })
})
