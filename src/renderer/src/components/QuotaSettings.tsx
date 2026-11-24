import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { QuotaBucket, QuotaSnapshot } from '@shared/api'
import { formatReset, secondsUntilReset } from '../lib/quota'
import { useNow } from '../lib/useNow'
import { formatTokens, percentOf } from '../lib/tokens'
import { ProgressBar } from './ui/ProgressBar'

interface Props {
  /** undefined while the first read is in flight, null when it cannot be read. */
  quota: QuotaSnapshot | null | undefined
  onRefresh: () => Promise<unknown>
}

function Bucket({ label, bucket, format }: { label: string; bucket: QuotaBucket; format: (n: number) => string }) {
  if (bucket.limit <= 0) return null
  const percent = percentOf(bucket.used, bucket.limit)
  return (
    <li className="py-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted">
          {format(bucket.used)} of {format(bucket.limit)} · {percent}%
        </span>
      </div>
      <div className="mt-1.5">
        <ProgressBar percent={percent} label={label} />
      </div>
    </li>
  )
}

/** Your real quota, the same numbers Code Puppy's /usage shows. */
export function QuotaSettings({ quota, onRefresh }: Props) {
  const [busy, setBusy] = useState(false)
  const now = useNow(15_000) // keeps the reset countdown moving
  const refresh = async () => {
    setBusy(true)
    try {
      await onRefresh()
    } finally {
      setBusy(false)
    }
  }

  const refreshButton = (
    <button
      type="button"
      onClick={() => void refresh()}
      disabled={busy}
      aria-label="Refresh quota"
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted hover:bg-raised hover:text-ink disabled:opacity-60"
    >
      <RefreshCw size={14} aria-hidden className={busy ? 'animate-spin' : ''} />
      {busy ? 'Checking...' : 'Refresh'}
    </button>
  )

  if (quota === undefined) return <p className="text-sm text-muted">Checking your quota...</p>
  if (quota === null) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Could not read your quota right now. It needs a connection to your Code Puppy backend (VPN, if your organization uses one).</p>
        {refreshButton}
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm" data-testid="quota-reset">
          Resets in <span className="font-medium">{formatReset(secondsUntilReset(quota, now))}</span>
        </p>
        {refreshButton}
      </div>
      <ul aria-label="Quota" className="mt-1 divide-y divide-line">
        <Bucket label="Large models" bucket={quota.large} format={formatTokens} />
        <Bucket label="All models" bucket={quota.standard} format={formatTokens} />
        <Bucket label="Requests" bucket={quota.requests} format={(n) => n.toLocaleString()} />
      </ul>
      <p className="mt-3 text-xs text-muted">
        Large models draw on their own, smaller quota, carved out of the all-models one. Each model in the picker shows the quota that
        applies to it. The server does not publish which models count as large, so Puppy treats the most expensive tier (the Opus
        family and its peers) as large.
      </p>
    </>
  )
}
