import { afterEach, describe, expect, it } from 'vitest'
import { UpdateWatch } from './updateWatch'

describe('UpdateWatch', () => {
  let watch: UpdateWatch | undefined
  afterEach(() => watch?.stop())

  it('starts out with nothing to report', () => {
    watch = new UpdateWatch(async () => true)
    expect(watch.available).toBe(false)
  })

  it('reports an update, and only announces changes', async () => {
    watch = new UpdateWatch(async () => true)
    const heard: boolean[] = []
    watch.on('changed', (available) => heard.push(available))
    expect(await watch.check()).toBe(true)
    await watch.check()
    expect(heard).toEqual([true])
  })

  it('clears once the update is installed', async () => {
    let waiting = true
    watch = new UpdateWatch(async () => waiting)
    await watch.check()
    waiting = false
    await watch.check()
    expect(watch.available).toBe(false)
  })

  it('treats a failing check as nothing to report', async () => {
    watch = new UpdateWatch(async () => {
      throw new Error('git exploded')
    })
    expect(await watch.check()).toBe(false)
  })

  it('shares one check between overlapping calls', async () => {
    let runs = 0
    watch = new UpdateWatch(async () => ++runs > 0)
    await Promise.all([watch.check(), watch.check()])
    expect(runs).toBe(1)
  })

  it('checks on start, and again on its interval', async () => {
    let runs = 0
    watch = new UpdateWatch(async () => ++runs > 100)
    watch.start(5)
    await expect.poll(() => runs, { timeout: 2_000 }).toBeGreaterThan(2)
  })
})
