import { EventEmitter } from 'node:events'

const HALF_HOUR_MS = 30 * 60_000

/**
 * Whether a newer Puppy is waiting, kept fresh in the background so the UI can
 * show a badge without the user having to go and ask. Checks are single-flight;
 * a check that blows up counts as "nothing to report", never as an error.
 */
export class UpdateWatch extends EventEmitter<{ changed: [boolean] }> {
  private current = false
  private inflight: Promise<boolean> | null = null
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly find: () => Promise<boolean>) {
    super()
  }

  get available(): boolean {
    return this.current
  }

  check(): Promise<boolean> {
    this.inflight ??= this.find()
      .catch(() => false)
      .then((available) => this.settle(available))
      .finally(() => (this.inflight = null))
    return this.inflight
  }

  start(intervalMs = HALF_HOUR_MS): void {
    void this.check()
    this.timer ??= setInterval(() => void this.check(), intervalMs)
    this.timer.unref?.() // never the reason a process stays alive
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private settle(available: boolean): boolean {
    if (available !== this.current) {
      this.current = available
      this.emit('changed', available)
    }
    return available
  }
}
