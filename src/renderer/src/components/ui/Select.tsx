import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { CHIP } from './chip'
import { ALIGN, PLACEMENT, POPOVER, useDismiss, useFlipToFit } from './popover'

export interface SelectOption {
  value: string
  label: string
  description?: string
  /** Extra content on the right of the row (e.g. a usage ring), before the selected checkmark. */
  trailing?: ReactNode
}

interface Props {
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  placement?: keyof typeof PLACEMENT
  align?: keyof typeof ALIGN
  icon?: ReactNode
  /** Visual style of the trigger: a chip (under the message box) or a field (forms). */
  variant?: 'chip' | 'field'
  /** What the control is for, shown on hover (the trigger itself shows only the value). */
  hint?: string
  /** Shown on the trigger while `value` is empty (nothing chosen yet). */
  placeholder?: string
  /** Called each time the menu opens. */
  onOpen?: () => void
  /** Small note under the list (e.g. quota summary). */
  footer?: ReactNode
}

const SEARCH_THRESHOLD = 8

const TRIGGER = {
  chip: CHIP,
  field: 'w-full justify-between rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:border-muted/60',
} as const

/** Accessible listbox dropdown in the app's own style (replaces native <select>). */
export function Select({ label, value, options, onChange, placement = 'bottom', align = 'start', icon, variant = 'chip', hint, placeholder, onOpen, footer }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const popover = useRef<HTMLDivElement>(null)
  const id = useId()
  const searchable = options.length > SEARCH_THRESHOLD
  const selected = options.find((option) => option.value === value)
  const shown = selected?.label ?? (value === '' ? (placeholder ?? '') : value)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle ? options.filter((o) => `${o.label} ${o.description ?? ''}`.toLowerCase().includes(needle)) : options
  }, [options, query])

  const openMenu = () => {
    setOpen(true)
    onOpen?.()
  }

  const close = useCallback((refocus = false) => {
    setOpen(false)
    setQuery('')
    if (refocus) trigger.current?.focus()
  }, [])
  useDismiss(root, open, useCallback((reason) => close(reason === 'escape'), [close]))

  const side = useFlipToFit(open, popover, trigger, placement)

  useEffect(() => {
    if (!open) return
    setActive(Math.max(0, visible.findIndex((o) => o.value === value)))
    ;(searchable ? search.current : list.current)?.focus()
    // Only on open: re-running on every keystroke would reset the highlight.
  }, [open])

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const choose = (option: SelectOption | undefined) => {
    if (!option) return
    onChange(option.value)
    close(true)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 }
    if (event.key in moves) {
      event.preventDefault()
      setActive((index) => Math.min(visible.length - 1, Math.max(0, index + moves[event.key])))
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setActive(event.key === 'Home' ? 0 : visible.length - 1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(visible[active])
    } else if (event.key === 'Tab') {
      close()
    }
  }

  const optionId = (index: number) => `${id}-option-${index}`

  return (
    <div ref={root} className="relative inline-flex min-w-0">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${shown}`}
        title={hint}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            openMenu()
          }
        }}
        className={`inline-flex max-w-full items-center gap-1.5 ${TRIGGER[variant]}`}
      >
        {icon}
        <span className="truncate">{shown}</span>
        <ChevronDown size={variant === 'chip' ? 12 : 14} aria-hidden className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div ref={popover} className={`${POPOVER} ${PLACEMENT[side]} ${ALIGN[align]} w-72`} onKeyDown={onKeyDown}>
          {searchable && (
            <div className="mb-1 flex items-center gap-2 border-b border-line px-2 pb-1.5">
              <Search size={14} aria-hidden className="text-muted" />
              <input
                ref={search}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setActive(0)
                }}
                placeholder={`Search ${label.toLowerCase()}s...`}
                aria-label={`Search ${label.toLowerCase()}s`}
                aria-controls={`${id}-list`}
                aria-activedescendant={visible.length ? optionId(active) : undefined}
                className="w-full bg-transparent py-1 text-sm placeholder:text-muted focus:outline-none"
              />
            </div>
          )}
          <ul
            ref={list}
            id={`${id}-list`}
            role="listbox"
            tabIndex={-1}
            aria-label={label}
            aria-activedescendant={visible.length ? optionId(active) : undefined}
            className="max-h-72 overflow-y-auto focus:outline-none"
          >
            {visible.length === 0 && <li className="px-3 py-2 text-sm text-muted">No matches</li>}
            {visible.map((option, index) => (
              <li
                key={option.value}
                id={optionId(index)}
                data-index={index}
                role="option"
                aria-selected={option.value === value}
                onPointerMove={() => setActive(index)}
                onClick={() => choose(option)}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm ${index === active ? 'bg-raised' : ''}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{option.label}</span>
                  {option.description && <span className="block truncate text-xs text-muted">{option.description}</span>}
                </span>
                {option.trailing}
                {/* Fixed slot, so trailing content lines up in one column whether or not this row is selected. */}
                <span className="grid size-4 shrink-0 place-items-center">
                  {option.value === value && <Check size={15} aria-hidden className="text-accent" />}
                </span>
              </li>
            ))}
          </ul>
          {footer && <div className="mt-1 border-t border-line px-2.5 pt-2 pb-1 text-xs text-muted">{footer}</div>}
        </div>
      )}
    </div>
  )
}
