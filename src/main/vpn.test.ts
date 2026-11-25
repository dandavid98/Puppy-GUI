import { afterEach, describe, expect, it } from 'vitest'
import type { VpnStatus } from '@shared/api'
import { VpnWatch } from './vpn'

describe('VpnWatch', () => {
  let watch: VpnWatch | undefined
  afterEach(() => watch?.stop())

  const heard = (target: VpnWatch) => {
    const statuses: VpnStatus[] = []
    target.on('changed', (status) => statuses.push(status))
    return statuses
  }

  it('starts out not knowing', () => {
    watch = new VpnWatch(async () => true)
    expect(watch.status).toBe('unknown')
  })

  it('reports connected when the backend answers, and only announces changes', async () => {
    watch = new VpnWatch(async () => true)
    const statuses = heard(watch)
    expect(await watch.check()).toBe('connected')
    await watch.check()
    expect(statuses).toEqual(['connected'])
  })

  it('reports disconnected when the backend does not answer, or the probe blows up', async () => {
    watch = new VpnWatch(async () => false)
    expect(await watch.check()).toBe('disconnected')
    watch.stop()
    watch = new VpnWatch(async () => {
      throw new Error('ENOTFOUND')
    })
    expect(await watch.check()).toBe('disconnected')
  })

  it('shares one probe between overlapping checks', async () => {
    let probes = 0
    watch = new VpnWatch(async () => ++probes > 0)
    await Promise.all([watch.check(), watch.check(), watch.check()])
    expect(probes).toBe(1)
  })

  it('keeps checking while offline, and clears itself once the VPN is back', async () => {
    let up = false
    watch = new VpnWatch(async () => up, 5)
    const statuses = heard(watch)
    await watch.check()
    up = true
    await expect.poll(() => watch!.status, { timeout: 2_000 }).toBe('connected')
    expect(statuses).toEqual(['disconnected', 'connected'])
  })
})
