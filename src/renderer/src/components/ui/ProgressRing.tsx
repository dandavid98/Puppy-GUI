interface Props {
  /** 0-100. The ring is full at 100. */
  percent: number
  size?: number
  /** Accessible description. Omit when the ring only decorates text that already says it. */
  label?: string
  /** Print the percentage in the middle of the ring. */
  showValue?: boolean
  /** Print this instead of the percentage (e.g. "free"). */
  text?: string
  /** Neutral grey: there is nothing to measure. */
  muted?: boolean
}

/** A small circular progress meter. Turns red from 80% so "nearly full" reads at a glance. */
export function ProgressRing({ percent, size = 34, label, showValue = true, text, muted = false }: Props) {
  const stroke = size >= 28 ? 3 : 2.5
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const shown = Math.min(100, Math.max(0, percent))
  const tone = muted ? 'text-muted' : shown >= 80 ? 'text-danger' : 'text-accent'
  return (
    <span
      {...(label ? { role: 'img', 'aria-label': label, title: label } : { 'aria-hidden': true })}
      className={`relative inline-grid shrink-0 place-items-center ${tone}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown / 100)}
        />
      </svg>
      {showValue && <span className="absolute text-[10px] font-medium leading-none text-ink tabular-nums">{text ?? `${Math.round(shown)}%`}</span>}
    </span>
  )
}
