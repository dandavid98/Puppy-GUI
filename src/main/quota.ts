import { EventEmitter } from 'node:events'
import type { QuotaSnapshot } from '@shared/api'
import { runPython, runScript, type Runner } from './codePuppyPython'

/** Runs inside code-puppy's own Python (see codePuppyPython): it fetches with the user's own token and certificates. */
export const QUOTA_SCRIPT = `
out = {}
try:
    from code_puppy.plugins.walmart_specific.token_quota_display import fetch_quota_status
    out["quota"] = fetch_quota_status()
except Exception as error:
    out["error"] = type(error).__name__
if "--rates" in sys.argv:
    try:
        from code_puppy.plugins.walmart_specific.model_config_fetcher import ModelConfigFetcher
        ModelConfigFetcher._fetch_remote_config()  # read-only; load_config() would rewrite the user's models.json
        out["burn_rates"] = ModelConfigFetcher.model_burn_rates
    except Exception:
        pass
emit(out)
`

interface RawOutput {
  quota: Record<string, unknown> | null
  burnRates: Record<string, number> | null
}

/** Make sense of what the script emitted. Never throws. */
export function readQuotaOutput(emitted: unknown): RawOutput {
  const parsed = (emitted && typeof emitted === 'object' ? emitted : {}) as { quota?: unknown; burn_rates?: unknown }
  const quota = parsed.quota && typeof parsed.quota === 'object' ? (parsed.quota as Record<string, unknown>) : null
  const rates = parsed.burn_rates && typeof parsed.burn_rates === 'object' ? Object.entries(parsed.burn_rates as Record<string, unknown>) : []
  const burnRates = Object.fromEntries(rates.filter(([, rate]) => typeof rate === 'number' && Number.isFinite(rate) && rate >= 0)) as Record<string, number>
  return { quota, burnRates: rates.length ? burnRates : null }
}

const count = (value: unknown): number => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

/** Turn the backend's JSON into our shape; null when it describes no quota at all. */
export function toSnapshot(raw: Record<string, unknown> | null, burnRates: Record<string, number>, fetchedAt: number): QuotaSnapshot | null {
  if (!raw) return null
  const standard = { used: count(raw.tokens_used), limit: count(raw.token_limit) }
  const large = { used: count(raw.large_model_tokens_used), limit: count(raw.large_model_token_limit) }
  const requests = { used: count(raw.requests_used), limit: count(raw.request_limit) }
  if (!standard.limit && !large.limit && !requests.limit) return null
  return { fetchedAt, standard, large, requests, resetsInSecs: count(raw.resets_in_secs), burnRates }
}

const STALE_AFTER_MS = 30 * 60_000
/** Let the server finish rolling its window over before we ask what the new one looks like. */
const RESET_BUFFER_MS = 3_000
/** If the server keeps saying the reset is "now" (clock skew), retry gently rather than spin. */
const MIN_RESET_DELAY_MS = 15_000
/** setTimeout cannot wait longer than this (about 24 days). */
const MAX_TIMER_MS = 2 ** 31 - 1

/**
 * The user's real quota, kept fresh. Reading costs a couple of seconds of
 * Python, so reads are single-flight and rate-limited, and the (rarely
 * changing) per-model burn rates are fetched only until we have them once.
 *
 * Besides polling, it reads again the moment the user's own quota window ends:
 * each reading says how many seconds remain, so everyone gets a refresh at their
 * own reset time, whatever it is (nothing is hard-coded).
 */
export class QuotaService extends EventEmitter<{ changed: [QuotaSnapshot | null] }> {
  private latest: QuotaSnapshot | null = null
  private burnRates: Record<string, number> | null = null
  private inflight: Promise<QuotaSnapshot | null> | null = null
  private soon: ReturnType<typeof setTimeout> | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private resetTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly python: () => string | null,
    private readonly run: Runner = runPython,
    private readonly now: () => number = Date.now,
    private readonly minIntervalMs = 20_000,
  ) {
    super()
  }

  get snapshot(): QuotaSnapshot | null {
    return this.latest
  }

  /** Cached if read recently (unless `force`), otherwise fetched. Resolves null when quota cannot be read. */
  refresh({ force = false }: { force?: boolean } = {}): Promise<QuotaSnapshot | null> {
    if (!force && this.latest && this.now() - this.latest.fetchedAt < this.minIntervalMs) return Promise.resolve(this.latest)
    this.inflight ??= this.fetch().finally(() => (this.inflight = null))
    return this.inflight
  }

  /** After a model turn the numbers have moved; wait a moment so a burst of turns costs one read. */
  refreshSoon(delayMs = 5_000): void {
    if (this.soon) clearTimeout(this.soon)
    this.soon = setTimeout(() => {
      this.soon = null
      void this.refresh()
    }, delayMs)
  }

  start(intervalMs = 5 * 60_000): void {
    void this.refresh()
    this.timer ??= setInterval(() => void this.refresh(), intervalMs)
  }

  stop(): void {
    if (this.soon) clearTimeout(this.soon)
    if (this.timer) clearInterval(this.timer)
    if (this.resetTimer) clearTimeout(this.resetTimer)
    this.soon = this.timer = this.resetTimer = null
  }

  /** (Re)arm the one-shot read for when this reading's window ends. */
  private scheduleReset(snapshot: QuotaSnapshot): void {
    if (this.resetTimer) clearTimeout(this.resetTimer)
    this.resetTimer = null
    if (snapshot.resetsInSecs <= 0) return // no reset time given: polling alone will do
    const resetAt = snapshot.fetchedAt + snapshot.resetsInSecs * 1000
    const delay = Math.min(MAX_TIMER_MS, Math.max(MIN_RESET_DELAY_MS, resetAt - this.now() + RESET_BUFFER_MS))
    this.resetTimer = setTimeout(() => {
      this.resetTimer = null
      void this.refresh({ force: true })
    }, delay)
    this.resetTimer.unref?.() // never the reason a process stays alive
  }

  private async fetch(): Promise<QuotaSnapshot | null> {
    const python = this.python()
    if (!python) return this.publish(null)
    try {
      const output = readQuotaOutput(await runScript(python, QUOTA_SCRIPT, this.burnRates ? [] : ['--rates'], this.run))
      this.burnRates ??= output.burnRates
      return this.publish(toSnapshot(output.quota, this.burnRates ?? {}, this.now()))
    } catch {
      return this.publish(null)
    }
  }

  /** A failed read keeps the last good numbers for a while rather than blanking the UI. */
  private publish(next: QuotaSnapshot | null): QuotaSnapshot | null {
    const usable = next ?? (this.latest && this.now() - this.latest.fetchedAt < STALE_AFTER_MS ? this.latest : null)
    this.latest = usable
    if (next) this.scheduleReset(next) // a failed read keeps whatever was already scheduled
    this.emit('changed', usable)
    return usable
  }
}
