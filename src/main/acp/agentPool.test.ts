import { EventEmitter } from 'node:events'
import type { ClientContext } from '@agentclientprotocol/sdk'
import type { AgentStatus, PermissionPrompt } from '@shared/api'
import { describe, expect, it } from 'vitest'
import { AgentPool, type Agent, type AgentEvents } from './agentPool'

class FakeAgent extends EventEmitter<AgentEvents> implements Agent {
  status: AgentStatus = { state: 'ready' }
  stopped = 0
  answers: [string, string | null][] = []
  cancelled: string[] = []
  constructor(readonly folder: string) {
    super()
  }
  context = async () => ({}) as ClientContext
  stop = () => void this.stopped++
  answerPermission = (requestId: string, optionId: string | null) => void this.answers.push([requestId, optionId])
  cancelPermissions = (sessionId: string) => void this.cancelled.push(sessionId)
  setStatus(status: AgentStatus) {
    this.status = status
    this.emit('status', status)
  }
}

const setup = () => {
  const made: FakeAgent[] = []
  const pool = new AgentPool((folder) => {
    const agent = new FakeAgent(folder)
    made.push(agent)
    return agent
  }, '/home')
  return { pool, made }
}

const prompt = (requestId: string, sessionId = 's'): PermissionPrompt => ({ requestId, sessionId, title: 'Run?', options: [] })

describe('AgentPool', () => {
  it('starts one agent per folder, only when first asked, and reuses it', () => {
    const { pool, made } = setup()
    expect(made).toHaveLength(0)
    const a = pool.forFolder('/work/app')
    expect(pool.forFolder('/work/app')).toBe(a)
    expect(pool.forFolder('/work/app/')).toBe(a) // trailing slash: same project
    expect(pool.forFolder('/work/other')).not.toBe(a)
    expect(made.map((agent) => agent.folder)).toEqual(['/work/app', '/work/other'])
  })

  it('gives each agent its own folder to start in, and keeps chat on the home folder', () => {
    const { pool, made } = setup()
    pool.forFolder('/work/app')
    expect(pool.home).toBe(pool.forFolder('/home'))
    expect(made.map((agent) => agent.folder)).toEqual(['/work/app', '/home'])
  })

  it('re-emits every agent\'s session updates and permission requests', () => {
    const { pool, made } = setup()
    const updates: string[] = []
    const prompts: string[] = []
    pool.on('sessionUpdate', ({ sessionId }) => updates.push(sessionId))
    pool.on('permissionRequest', ({ requestId }) => prompts.push(requestId))
    pool.forFolder('/a')
    pool.forFolder('/b')
    made[0].emit('sessionUpdate', { sessionId: 'from-a', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'x' } } })
    made[1].emit('permissionRequest', prompt('r1'))
    expect(updates).toEqual(['from-a'])
    expect(prompts).toEqual(['r1'])
  })

  it('sends a permission answer back to the agent that asked, and only that one', () => {
    const { pool, made } = setup()
    pool.forFolder('/a')
    pool.forFolder('/b')
    made[1].emit('permissionRequest', prompt('r1'))
    pool.answerPermission('r1', 'allow')
    pool.answerPermission('r1', 'allow') // a late duplicate goes nowhere
    pool.answerPermission('unknown', 'allow')
    expect(made[0].answers).toEqual([])
    expect(made[1].answers).toEqual([['r1', 'allow']])
  })

  it('cancels pending permissions for a session on every agent', () => {
    const { pool, made } = setup()
    pool.forFolder('/a')
    pool.forFolder('/b')
    pool.cancelPermissions('s9')
    expect(made.map((agent) => agent.cancelled)).toEqual([['s9'], ['s9']])
  })

  describe('status', () => {
    it('is the home agent\'s, and a project agent starting up is not news', () => {
      const { pool, made } = setup()
      const seen: string[] = []
      pool.on('status', (status) => seen.push(status.state))
      pool.home // made[0]
      pool.forFolder('/work/app') // made[1]
      made[0].setStatus({ state: 'starting' })
      made[1].setStatus({ state: 'starting' })
      made[0].setStatus({ state: 'ready' })
      made[1].setStatus({ state: 'ready' })
      expect(seen).toEqual(['starting', 'ready'])
      expect(pool.status).toEqual({ state: 'ready' })
    })

    it('surfaces a failed project agent, and recovers when it does', () => {
      const { pool, made } = setup()
      pool.home
      pool.forFolder('/work/app')
      const seen: string[] = []
      pool.on('status', (status) => seen.push(status.state))
      made[1].setStatus({ state: 'error', message: 'Code Puppy stopped unexpectedly (exit code 1).' })
      expect(pool.status).toEqual({ state: 'error', message: 'Code Puppy stopped unexpectedly (exit code 1).' })
      made[1].setStatus({ state: 'ready' })
      expect(seen).toEqual(['error', 'ready'])
    })
  })

  it('stops every agent, and restart brings back just the home agent', async () => {
    const { pool, made } = setup()
    pool.home
    pool.forFolder('/work/app')
    await pool.restart()
    expect(made.map((agent) => agent.stopped)).toEqual([1, 1])
  })
})
