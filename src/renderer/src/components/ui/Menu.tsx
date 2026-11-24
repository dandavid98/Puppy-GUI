import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ALIGN, PLACEMENT, POPOVER, useDismiss } from './popover'

export interface MenuItem {
  label: string
  icon: LucideIcon
  onSelect: () => void
  danger?: boolean
}

interface Props {
  label: string
  trigger: ReactNode
  items: MenuItem[]
  placement?: keyof typeof PLACEMENT
  align?: keyof typeof ALIGN
  triggerClassName?: string
}

/** A small action menu (role="menu") with arrow-key navigation. */
export function Menu({ label, trigger, items, placement = 'bottom', align = 'end', triggerClassName = '' }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const close = useCallback((refocus = false) => {
    setOpen(false)
    if (refocus) button.current?.focus()
  }, [])
  useDismiss(root, open, useCallback((reason) => close(reason === 'escape'), [close]))

  useEffect(() => {
    if (open) root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [open])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const entries = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const index = entries.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      entries[(index + step + entries.length) % entries.length]?.focus()
    }
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div role="menu" aria-label={label} onKeyDown={onKeyDown} className={`${POPOVER} ${PLACEMENT[placement]} ${ALIGN[align]} min-w-40`}>
          {items.map(({ label: text, icon: Icon, onSelect, danger }) => (
            <button
              key={text}
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation()
                close()
                onSelect()
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm focus:bg-raised focus:outline-none ${danger ? 'text-danger hover:bg-danger-soft' : 'hover:bg-raised'}`}
            >
              <Icon size={15} aria-hidden />
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
