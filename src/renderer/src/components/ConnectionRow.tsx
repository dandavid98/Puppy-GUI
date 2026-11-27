import { CircleCheck, CircleHelp, Clock, ExternalLink, LogIn, RefreshCw, Trash2, TriangleAlert, Unplug } from 'lucide-react'
import type { ConnectionInfo } from '@shared/api'
import { connectionHealth, formatRemaining, type Health } from '@shared/connections'
import { BUTTON } from './ui/Page'

const LOOK: Record<Health, { Icon: typeof CircleCheck; label: string; tone: string }> = {
  ok: { Icon: CircleCheck, label: 'Connected', tone: 'text-muted' },
  soon: { Icon: Clock, label: 'Expires soon', tone: 'text-accent' },
  expired: { Icon: TriangleAlert, label: 'Expired', tone: 'text-danger' },
  off: { Icon: Unplug, label: 'Not connected', tone: 'text-danger' },
  unknown: { Icon: CircleHelp, label: 'Could not check', tone: 'text-muted' },
}

const when = (ms: number) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** "Connected · expires Dec 4, 10:22 AM (in 6d 16h)", "Expires soon · Dec 4, 10:22 AM (in 5h 29m)". */
export function statusLine(connection: ConnectionInfo, now: number): string {
  const health = connectionHealth(connection, now)
  const { label } = LOOK[health]
  if (connection.expiresAt === null || health === 'off' || health === 'unknown') return label
  if (health === 'expired') return `Expired ${when(connection.expiresAt)}`
  const left = `(in ${formatRemaining(connection.expiresAt - now)})`
  return health === 'soon' ? `${label} · ${when(connection.expiresAt)} ${left}` : `${label} · expires ${when(connection.expiresAt)} ${left}`
}

interface Props {
  connection: ConnectionInfo
  now: number
  open: boolean
  waiting: boolean
  onRenew: () => void
  onRecheck: () => void
  onOpenPage: () => void
  onRemove: () => void
}

export function ConnectionRow({ connection, now, open, waiting, onRenew, onRecheck, onOpenPage, onRemove }: Props) {
  const health = connectionHealth(connection, now)
  const { Icon, tone } = LOOK[health]
  const renew = connection.renew
  const needsRenewal = health === 'soon' || health === 'expired' || health === 'off'

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <Icon size={16} aria-hidden className={`mt-0.5 shrink-0 ${tone}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="text-sm font-medium">{connection.name}</h3>
            {connection.account && <span className="text-xs text-muted">{connection.account}</span>}
          </div>
          <p className={`text-sm ${tone}`}>{waiting ? 'Waiting for you to finish in Chrome...' : statusLine(connection, now)}</p>
          {connection.note && <p className="text-xs text-muted">{connection.note}</p>}
        </div>
        {renew && needsRenewal && !waiting && (
          <button type="button" onClick={onRenew} aria-expanded={renew.signIn ? undefined : open} aria-label={`${renew.signIn ? 'Sign in for' : 'Renew'} ${connection.name}`} className={BUTTON}>
            {renew.signIn ? <LogIn size={14} aria-hidden /> : <RefreshCw size={14} aria-hidden />}
            {renew.signIn ? 'Sign in' : 'Renew'}
          </button>
        )}
        {connection.removable && (
          <button type="button" onClick={onRemove} aria-label={`Remove ${connection.name}`} title="Remove" className="rounded-md p-1.5 text-muted hover:bg-raised hover:text-danger">
            <Trash2 size={15} aria-hidden />
          </button>
        )}
      </div>

      {open && renew && !renew.signIn && (
        <div className="mt-3 ml-7 rounded-xl border border-line p-4">
          {renew.steps && <pre className="selectable font-sans text-sm leading-relaxed whitespace-pre-wrap">{renew.steps}</pre>}
          <div className="mt-3 flex flex-wrap gap-2">
            {renew.url && (
              <button type="button" onClick={onOpenPage} className={BUTTON}>
                <ExternalLink size={14} aria-hidden />
                Open page
              </button>
            )}
            <button type="button" onClick={onRecheck} className={BUTTON}>
              <RefreshCw size={14} aria-hidden />
              Check again
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
