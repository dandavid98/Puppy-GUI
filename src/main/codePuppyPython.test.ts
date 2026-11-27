import { describe, expect, it } from 'vitest'
import { PRELUDE, pythonNextTo, readSentinel, runScript, SENTINEL, type Runner } from './codePuppyPython'

describe('readSentinel', () => {
  it('finds our line among terminal escape codes and other chatter, taking the last one', () => {
    const stdout = `\u001b]11;?\u0007banner\n${SENTINEL}{"a":1}\nnoise\n${SENTINEL}{"a":2}\n`
    expect(readSentinel(stdout)).toEqual({ a: 2 })
  })

  it('is null when the line is missing or garbled', () => {
    expect(readSentinel('')).toBeNull()
    expect(readSentinel(`${SENTINEL}{oops`)).toBeNull()
  })
})

describe('runScript', () => {
  it('runs the body after the prelude, and returns what it emitted', async () => {
    let seen: string[] = []
    const run: Runner = async (_python, args) => {
      seen = args
      return `${SENTINEL}{"ok":true}`
    }
    expect(await runScript('py', 'emit({"ok": True})', { args: ['--flag'] }, run)).toEqual({ ok: true })
    expect(seen[0]).toBe('-c')
    expect(seen[1].startsWith(PRELUDE)).toBe(true)
    expect(seen[1].endsWith('emit({"ok": True})')).toBe(true)
    expect(seen[2]).toBe('--flag')
  })

  it('skips the network doctor for scripts that stay on this Mac, but can still emit', async () => {
    let script = ''
    const run: Runner = async (_python, args) => {
      script = args[1]
      return ''
    }
    await runScript('py', 'emit(1)', { network: false }, run)
    expect(script).not.toContain('run_doctor')
    expect(script).toContain('def emit')
  })

  it('passes a longer timeout through, for slow scripts such as signing in', async () => {
    let timeout: number | undefined
    await runScript('py', '', { timeoutMs: 200_000 }, async (_python, _args, timeoutMs) => {
      timeout = timeoutMs
      return ''
    })
    expect(timeout).toBe(200_000)
  })

  it('has the prelude fix the environment the way code-puppy itself does at startup', () => {
    expect(PRELUDE).toContain('run_doctor(stream=io.StringIO())') // quietly: its report must not reach stdout
  })
})

describe('pythonNextTo', () => {
  it('finds the interpreter beside the launcher, or nothing', () => {
    expect(pythonNextTo('/nonexistent/bin/code-puppy')).toBeNull()
  })
})
