import { execFile } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { AgentCatalog, toAgentList } from './agentCatalog'
import { pythonNextTo, SENTINEL, type Runner } from './codePuppyPython'
import { locateCodePuppy } from './locateCodePuppy'

const reply = (payload: unknown): Runner => async () => `noise\n${SENTINEL}${JSON.stringify(payload)}\n`

describe('toAgentList', () => {
  it('keeps well-formed agents, sorted by name, and falls back to the id for a missing display name', () => {
    const list = toAgentList({
      agents: [
        { name: 'qa-kitten', displayName: 'QA Kitten', description: 'Browser tests', custom: false },
        { name: 'mine', description: 'My own', custom: true },
        { displayName: 'no id' },
        null,
      ],
      current: 'qa-kitten',
    })
    expect(list.current).toBe('qa-kitten')
    expect(list.agents).toEqual([
      { name: 'mine', displayName: 'mine', description: 'My own', custom: true },
      { name: 'qa-kitten', displayName: 'QA Kitten', description: 'Browser tests', custom: false },
    ])
  })

  it('throws on output it cannot use, so the page can say so', () => {
    expect(() => toAgentList(null)).toThrow()
    expect(() => toAgentList({ agents: [] })).toThrow()
  })
})

describe('AgentCatalog', () => {
  it('lists without the network doctor (it is all on this Mac)', async () => {
    let script = ''
    const catalog = new AgentCatalog(() => 'py', async (_python, args) => {
      script = args[1]
      return `${SENTINEL}${JSON.stringify({ agents: [], current: 'code-puppy' })}`
    })
    expect(await catalog.list()).toEqual({ agents: [], current: 'code-puppy' })
    expect(script).not.toContain('run_doctor')
  })

  it('passes the chosen name as an argument, never inside the script', async () => {
    let args: string[] = []
    const catalog = new AgentCatalog(() => 'py', async (_python, received) => {
      args = received
      return `${SENTINEL}{"current": "qa-kitten"}`
    })
    expect(await catalog.use('qa-kitten')).toBe('qa-kitten')
    expect(args.slice(2)).toEqual(['qa-kitten'])
    expect(args[1]).not.toContain('qa-kitten')
  })

  it('says so when Code Puppy is missing or answers nonsense', async () => {
    await expect(new AgentCatalog(() => null, reply({})).list()).rejects.toThrow(/not installed/)
    await expect(new AgentCatalog(() => 'py', reply({ nope: 1 })).use('x')).rejects.toThrow()
  })
})

// Real Code Puppy: PUPPY_LIVE_AGENTS=1 npx vitest run src/main/agentCatalog.test.ts
describe.skipIf(!process.env.PUPPY_LIVE_AGENTS)('against the real Code Puppy', () => {
  it('lists this machine\'s agents, with descriptions', async () => {
    const python = pythonNextTo(locateCodePuppy())
    const list = await new AgentCatalog(() => python).list()
    expect(list.agents.length).toBeGreaterThan(5)
    expect(list.agents.find((agent) => agent.name === 'code-puppy')?.description).toBeTruthy()
  }, 30_000)

  it('switches the agent for its own parent process only (a stand-in for Puppy), not for anyone else', async () => {
    const python = pythonNextTo(locateCodePuppy())!
    // Both scripts run under one throwaway shell, so they share a parent: just as Puppy's processes do.
    const sameParent: Runner = (_python, args) =>
      new Promise((done, fail) =>
        execFile('/bin/sh', ['-c', `"$0" "$@"; true`, python, ...args], { timeout: 30_000, maxBuffer: 5_000_000 }, (error, stdout) => (error ? fail(error) : done(stdout))),
      )
    const catalog = new AgentCatalog(() => python, sameParent)
    expect(await catalog.use('qa-kitten')).toBe('qa-kitten')
    const elsewhere = await new AgentCatalog(() => python).list() // a different parent: this test runner
    expect(elsewhere.current).not.toBe('qa-kitten')
  }, 30_000)
})
