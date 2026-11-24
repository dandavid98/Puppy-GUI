import type { QuotaSnapshot } from '@shared/api'
import { describeModelQuota, formatReset, quotaForModel, secondsUntilReset } from '../lib/quota'
import { ProgressRing } from './ui/ProgressRing'

interface Props {
  quota: QuotaSnapshot
  /** The model's id (what the quota data is keyed by). */
  model: string
  /** Its display name, for the tooltip. */
  name: string
}

/** A model's place on the user's real quota. Renders nothing when we cannot tell, never a made-up 0%. */
export function ModelQuotaRing({ quota, model, name }: Props) {
  const state = quotaForModel(quota, model)
  if (!state) return null
  const label = describeModelQuota(name, state, formatReset(secondsUntilReset(quota, Date.now())))
  return state.kind === 'free' ? <ProgressRing percent={0} text="free" muted label={label} /> : <ProgressRing percent={state.percent} label={label} />
}
