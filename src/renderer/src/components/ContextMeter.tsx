import { useCallback, useRef, useState } from 'react'
import { formatTokens, percentOf } from '../lib/tokens'
import { ProgressBar } from './ui/ProgressBar'
import { ALIGN, PLACEMENT, POPOVER, useDismiss, useFlipToFit } from './ui/popover'
import { ProgressRing } from './ui/ProgressRing'

interface Props {
  /** Tokens in the context window, or null when there is no measurement yet. */
  used: number | null
  total: number
  /** The model whose window this is, named in the details. */
  model?: string
}

/**
 * How full the model's context window is, always on screen; click it for the
 * numbers. With no measurement yet (a new chat, or one saved before Puppy tracked
 * this) it shows a dash and says when the number will appear. Otherwise the count
 * is an estimate (ACP only reports token totals per turn).
 */
export function ContextMeter({ used, total, model }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const close = useCallback((refocus = false) => {
    setOpen(false)
    if (refocus) button.current?.focus()
  }, [])
  useDismiss(root, open, useCallback((reason) => close(reason === 'escape'), [close]))
  const side = useFlipToFit(open, panel, button, 'top')

  const known = used !== null
  const percent = known ? percentOf(used, total) : 0
  const label = known
    ? `Context window: about ${used.toLocaleString()} of ${total.toLocaleString()} tokens used (${percent}%). This is an estimate. Show details.`
    : `Context window: ${total.toLocaleString()} tokens. How full it is will show here after your next message. Show details.`

  return (
    <div ref={root} className="relative inline-flex shrink-0">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={known ? `${formatTokens(used)} of ${formatTokens(total)} used` : 'Context window'}
        data-testid="context-meter"
        data-known={known}
        onClick={() => (open ? close() : setOpen(true))}
        className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs text-muted hover:bg-raised hover:text-ink"
      >
        <ProgressRing percent={percent} size={18} showValue={false} muted={!known} />
        <span className="tabular-nums">{known ? formatTokens(used) : '–'}</span>
      </button>

      {open && (
        <div ref={panel} role="dialog" aria-label="Context window details" data-testid="context-details" className={`${POPOVER} ${PLACEMENT[side]} ${ALIGN.end} w-64`}>
          <div className="space-y-2 px-2.5 py-2">
            <p className="text-xs text-muted">Context window{model ? ` · ${model}` : ''}</p>
            <p className="text-lg font-semibold tabular-nums">
              {known ? formatTokens(used) : '–'} of {formatTokens(total)} <span className="text-sm font-normal text-muted">tokens used</span>
            </p>
            <ProgressBar percent={percent} label="Context window used" />
            {known ? (
              <>
                <p className="text-xs tabular-nums">
                  {percent}% used · about {formatTokens(Math.max(0, total - used))} left
                </p>
                <p className="text-xs text-muted">An estimate: Code Puppy reports token totals per turn, not the exact size of the window.</p>
              </>
            ) : (
              <p className="text-xs text-muted">Not measured yet. The number shows up after your next message.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
