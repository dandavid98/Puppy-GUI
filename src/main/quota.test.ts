import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { locateCodePuppy } from './locateCodePuppy'
import { pythonNextTo, QuotaService, readScriptOutput, runPython, toSnapshot, QUOTA_SCRIPT, type Runner } from './quota'

const line = (payload: unknown) => `PUPPY_QUOTA ${JSON.stringify(payload)}`
const backend = {
  tokens_used: 42_481_805,
  token_limit: 57_368_982,
  large_model_tokens_used: 25_025_112,
  large_model_token_limit: 25_000_000,
  requests_used: 349,
  request_limit: 1250,
  resets_in_secs: 5390,
}

describe('readScriptOutput', () => {
  it('finds the result among terminal escape codes and other chatter', () => {
    const stdout = `\u001b]11;?\u0007some banner\n${line({ quota: backend, burn_rates: { opus: 1, free: 0 } })}\n`
    expect(readScriptOutput(stdout)).toEqual({ quota: backend, burnRates: { opus: 1, free: 0 } })
  })

  it('treats a missing, malformed or error result as nothing', () => {
    expect(readScriptOutput('')).toEqual({ quota: null, burnRates: null })
    expect(readScriptOutput('PUPPY_QUOTA {oops')).toEqual({ quota: null, burnRates: null })
    expect(readScriptOutput(line({ error: 'ModuleNotFoundError' }))).toEqual({ quota: null, burnRates: null })
    expect(readScriptOutput(line({ quota: null }))).toEqual({ quota: null, burnRates: null })
  })

  it('drops burn rates that are not sensible numbers', () => {
    expect(readScriptOutput(line({ burn_rates: { a: 0.7, b: 'high', c: -1, d: null } })).burnRates).toEqual({ a: 0.7 })
  })
})

describe('toSnapshot', () => {
  it('maps the backend fields', () => {
    expect(toSnapshot(backend, { opus: 1 }, 1000)).toEqual({
      fetchedAt: 1000,
      standard: { used: 42_481_805, limit: 57_368_982 },
      large: { used: 25_025_112, limit: 25_000_000 },
      requests: { used: 349, limit: 1250 },
      resetsInSecs: 5390,
      burnRates: { opus: 1 },
    })
  })

  it('is null when the backend describes no quota at all, or sent nothing', () => {
    expect(toSnapshot({ tokens_used: 5 }, {}, 0)).toBeNull()
    expect(toSnapshot(null, {}, 0)).toBeNull()
  })

  it('coerces junk to zero rather than NaN', () => {
    const snapshot = toSnapshot({ ...backend, tokens_used: 'lots', resets_in_secs: null }, {}, 0)
    expect(snapshot?.standard.used).toBe(0)
    expect(snapshot?.resetsInSecs).toBe(0)
  })
})

describe('QuotaService', () => {
  const ok = (rates: unknown = { opus: 1 }): Runner => async (_python, args) => line({ quota: backend, ...(args.includes('--rates') ? { burn_rates: rates } : {}) })
  const clock = (start = 1_000_000) => {
    let time = start
    return { now: () => time, advance: (ms: number) => void (time += ms) }
  }

  it('reads once, then serves the cache inside the rate limit', async () => {
    const { now, advance } = clock()
    let runs = 0
    const service = new QuotaService(() => 'py', async (...args) => (runs++, ok()(...args)), now)
    const first = await service.refresh()
    expect(first?.large.used).toBe(25_025_112)
    await service.refresh()
    expect(runs).toBe(1)
    advance(21_000)
    await service.refresh()
    expect(runs).toBe(2)
  })

  it('shares one read between simultaneous callers', async () => {
    let runs = 0
    const service = new QuotaService(() => 'py', async (...args) => (runs++, ok()(...args)))
    await Promise.all([service.refresh(), service.refresh(), service.refresh()])
    expect(runs).toBe(1)
  })

  it('asks for burn rates until it has them, then stops asking', async () => {
    const { now, advance } = clock()
    const asked: boolean[] = []
    const service = new QuotaService(() => 'py', async (python, args) => (asked.push(args.includes('--rates')), ok()(python, args)), now)
    await service.refresh()
    advance(60_000)
    await service.refresh()
    expect(asked).toEqual([true, false])
    expect(service.snapshot?.burnRates).toEqual({ opus: 1 })
  })

  it('keeps retrying burn rates if the first attempt got none', async () => {
    const { now, advance } = clock()
    const asked: boolean[] = []
    const noRates: Runner = async (_p, args) => (asked.push(args.includes('--rates')), line({ quota: backend }))
    const service = new QuotaService(() => 'py', noRates, now)
    await service.refresh()
    advance(60_000)
    await service.refresh()
    expect(asked).toEqual([true, true])
  })

  it('keeps the last good numbers when a read fails, but not forever', async () => {
    const { now, advance } = clock()
    let healthy = true
    const service = new QuotaService(() => 'py', async (...args) => { if (!healthy) throw new Error('offline'); return ok()(...args) }, now)
    await service.refresh()
    healthy = false
    advance(60_000)
    expect((await service.refresh())?.standard.limit).toBe(57_368_982)
    advance(31 * 60_000)
    expect(await service.refresh()).toBeNull()
  })

  it('is simply unavailable when there is no interpreter', async () => {
    const service = new QuotaService(() => null, async () => { throw new Error('should not run') })
    expect(await service.refresh()).toBeNull()
  })

  it('announces every change', async () => {
    const service = new QuotaService(() => 'py', ok())
    const seen: (number | null)[] = []
    service.on('changed', (quota) => seen.push(quota?.standard.limit ?? null))
    await service.refresh()
    expect(seen).toEqual([57_368_982])
  })
})

describe('QuotaService: reads again at the user\'s own reset time', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000_000_000)
  })
  afterEach(() => vi.useRealTimers())

  const SECOND = 1000
  const BUFFER = 3 * SECOND // we wait this long past the reset for the server to roll its window over

  /** A backend whose Nth reading says `resets[N]` seconds remain (the last value repeats). */
  const backendResetting = (...resets: number[]) => {
    let reads = 0
    const run: Runner = async (_python, args) => {
      const resetsInSecs = resets[Math.min(reads++, resets.length - 1)]
      return line({ quota: { ...backend, resets_in_secs: resetsInSecs }, ...(args.includes('--rates') ? { burn_rates: { opus: 1 } } : {}) })
    }
    return { run, reads: () => reads }
  }
  const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms)

  it.each([600, 3_600, 3_720, 9_000, 21_600])('refreshes exactly once the window ends, whatever it is (%i seconds away)', async (secs) => {
    const { run, reads } = backendResetting(secs, 21_600)
    const service = new QuotaService(() => 'py', run)
    await service.refresh()
    expect(reads()).toBe(1)

    await advance(secs * SECOND + BUFFER - 1)
    expect(reads(), 'not before the reset').toBe(1)
    await advance(1)
    expect(reads(), 'right on time').toBe(2)

    // The new reading says a fresh window runs 6 hours: the next refresh is armed from that.
    await advance(21_600 * SECOND + BUFFER - 1)
    expect(reads()).toBe(2)
    await advance(1)
    expect(reads()).toBe(3)
    service.stop()
  })

  it('gives two users with different reset times each their own refresh', async () => {
    const [mine, theirs] = [backendResetting(3_720, 21_600), backendResetting(9_000, 21_600)] // 1h02m vs 2.5h
    const [a, b] = [new QuotaService(() => 'py', mine.run), new QuotaService(() => 'py', theirs.run)]
    await Promise.all([a.refresh(), b.refresh()])

    await advance(3_720 * SECOND + BUFFER)
    expect([mine.reads(), theirs.reads()]).toEqual([2, 1]) // only mine has reset
    await advance((9_000 - 3_720) * SECOND)
    expect([mine.reads(), theirs.reads()]).toEqual([2, 2]) // and now theirs
    a.stop()
    b.stop()
  })

  it('ignores the 20-second read limit, so a reset that is nearly now still refreshes', async () => {
    const { run, reads } = backendResetting(5, 21_600)
    const service = new QuotaService(() => 'py', run)
    await service.refresh()
    await advance(15 * SECOND) // the 15s floor; only 15s old, which the normal limit would call "fresh"
    expect(reads()).toBe(2)
    service.stop()
  })

  it('does not spin if the server keeps saying the reset is now', async () => {
    const { run, reads } = backendResetting(1)
    const service = new QuotaService(() => 'py', run)
    await service.refresh()
    await advance(15 * SECOND - 1)
    expect(reads()).toBe(1)
    await advance(1)
    expect(reads()).toBe(2)
    await advance(15 * SECOND)
    expect(reads()).toBe(3) // gentle retries, not a hot loop
    service.stop()
  })

  it('schedules nothing when the server gives no reset time', async () => {
    const { run, reads } = backendResetting(0)
    const service = new QuotaService(() => 'py', run)
    await service.refresh()
    await advance(7 * 3_600 * SECOND)
    expect(reads()).toBe(1)
  })

  it('replaces the old schedule with a newer reading instead of keeping both', async () => {
    const { run, reads } = backendResetting(7_200, 3_600)
    const service = new QuotaService(() => 'py', run)
    await service.refresh() // says: 2 hours
    await advance(21 * SECOND)
    await service.refresh() // newer reading says: 1 hour from now
    expect(reads()).toBe(2)

    await advance(3_600 * SECOND + BUFFER - 1)
    expect(reads()).toBe(2)
    await advance(1)
    expect(reads(), 'the newer, nearer reset').toBe(3)

    await advance((7_200 - 21 - 3_600 - 3) * SECOND) // the old 2-hour mark passes: it must not fire again
    expect(reads()).toBe(3)
    service.stop()
  })

  it('keeps the pending refresh when some other read fails', async () => {
    let calls = 0
    const run: Runner = async (...args) => {
      calls++
      if (calls === 2) throw new Error('offline')
      return backendResetting(3_600, 21_600).run(...args)
    }
    const service = new QuotaService(() => 'py', run)
    await service.refresh()
    await advance(21 * SECOND)
    await service.refresh() // fails
    expect(calls).toBe(2)
    await advance(3_600 * SECOND)
    expect(calls, 'the reset-time read still happens').toBe(3)
    service.stop()
  })

  it('stop() cancels it', async () => {
    const { run, reads } = backendResetting(600)
    const service = new QuotaService(() => 'py', run)
    await service.refresh()
    service.stop()
    await advance(3_600 * SECOND)
    expect(reads()).toBe(1)
  })
})

describe('pythonNextTo', () => {
  it('finds the interpreter beside the launcher, or nothing', () => {
    expect(pythonNextTo('/nonexistent/bin/code-puppy')).toBeNull()
  })
})

// Real network, real credentials: run with PUPPY_LIVE_QUOTA=1 npx vitest run src/main/quota.test.ts
describe.skipIf(!process.env.PUPPY_LIVE_QUOTA)('against the real service', () => {
  it('reads this machine\'s actual quota through code-puppy\'s own Python', async () => {
    const python = pythonNextTo(locateCodePuppy())
    expect(python).not.toBeNull()
    const snapshot = await new QuotaService(() => python, runPython).refresh()
    expect(snapshot).not.toBeNull()
    expect(snapshot!.standard.limit).toBeGreaterThan(0)
    expect(Object.keys(snapshot!.burnRates).length).toBeGreaterThan(5)
    expect(QUOTA_SCRIPT).not.toMatch(/token\s*=|x-api-key/i) // we never handle the credential ourselves
  }, 40_000)
})
