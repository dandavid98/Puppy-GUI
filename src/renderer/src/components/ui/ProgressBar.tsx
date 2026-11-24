interface Props {
  /** 0-100. */
  percent: number
  /** What the bar measures, for screen readers. */
  label: string
}

/** A thin horizontal meter. Turns red from 80%, like the rings. */
export function ProgressBar({ percent, label }: Props) {
  const shown = Math.min(100, Math.max(0, percent))
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={shown} className="h-1.5 overflow-hidden rounded-full bg-raised">
      <div className={`h-full rounded-full ${shown >= 80 ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${shown}%` }} />
    </div>
  )
}
