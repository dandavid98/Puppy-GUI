import { EventEmitter } from 'node:events'
import type { VpnStatus } from '@shared/api'
import { canConnect } from './localServer'

/**
 * Code Puppy's own backend. It only answers on the Walmart VPN or Eagle WiFi, so
 * "can I reach it?" is the same question as "am I on the network Code Puppy needs?".
 * `PUPPY_DESKTOP_VPN_HOST` points the probe elsewhere (for tests, or another environment).
 */
export const VPN_PROBE_HOST = process.env.PUPPY_DESKTOP_VPN_HOST ?? 'puppy-backend.walmart.com'

const PROBE_TIMEOUT_MS = 3_000
const RECHECK_MS = 5_000

const reachBackend = () => canConnect(VPN_PROBE_HOST, 443, PROBE_TIMEOUT_MS)

/**
 * Knows whether the user is on the VPN. Without it, a message sent off the VPN
 * just sits on "Sniffing around..." forever, with nothing to say why.
 *
 * Checks are single-flight. Once we know we are offline it keeps asking by itself,
 * so the warning goes away the moment the VPN connects.
 */
export class VpnWatch extends EventEmitter<{ changed: [VpnStatus] }> {
  private current: VpnStatus = 'unknown'
  private inflight: Promise<VpnStatus> | null = null
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly probe: () => Promise<boolean> = reachBackend,
    private readonly recheckMs = RECHECK_MS,
  ) {
    super()
  }

  get status(): VpnStatus {
    return this.current
  }

  check(): Promise<VpnStatus> {
    this.inflight ??= this.probe()
      .catch(() => false)
      .then((up) => this.settle(up ? 'connected' : 'disconnected'))
      .finally(() => (this.inflight = null))
    return this.inflight
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private settle(status: VpnStatus): VpnStatus {
    if (status === 'disconnected') {
      this.timer ??= setInterval(() => void this.check(), this.recheckMs)
      this.timer.unref?.() // never the reason a process stays alive
    } else {
      this.stop()
    }
    if (status !== this.current) {
      this.current = status
      this.emit('changed', status)
    }
    return status
  }
}
