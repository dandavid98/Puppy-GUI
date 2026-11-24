import type { QuotaSnapshot } from '@shared/api'
import { quotaSummary } from '../lib/quota'
import { useNow } from '../lib/useNow'

/** "Large 100% · Others 90% · resets in 1h 15m", with the countdown kept current while it is on screen. */
export function QuotaSummary({ quota }: { quota: QuotaSnapshot }) {
  const now = useNow(15_000)
  return <span data-testid="quota-summary">{quotaSummary(quota, now)}</span>
}
