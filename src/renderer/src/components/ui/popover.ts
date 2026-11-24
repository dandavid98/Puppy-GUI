import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'

export type DismissReason = 'escape' | 'outside'

/**
 * Close a popover on outside click or Escape. Shared by Select and Menu.
 * The reason lets callers return focus to their trigger after Escape (keyboard
 * users must not be dumped at the top of the page) but not after an outside click.
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: (reason: DismissReason) => void,
): void {
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose('outside')
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation() // don't also stop a running turn
        onClose('escape')
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [ref, open, onClose])
}

/** Shared popover surface so every floating panel looks the same. */
export const POPOVER =
  'absolute z-50 min-w-48 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-[0_8px_30px_rgba(0,0,0,0.12)]'

export const PLACEMENT = {
  top: 'bottom-full mb-2',
  bottom: 'top-full mt-2',
} as const

export const ALIGN = {
  start: 'left-0',
  end: 'right-0',
} as const

/** The app's top bar: a popover must not slide underneath it. */
const TOP_CLEARANCE = 56
const EDGE_GAP = 8

/**
 * Which side a popover should open on. It opens on the requested side first; if it does not
 * fit there but fits on the other, it flips (before anything is painted, so nothing jumps).
 * The composer sits mid-window on the home screen, so "above it" is not always roomy enough.
 */
export function useFlipToFit(
  open: boolean,
  popover: RefObject<HTMLElement | null>,
  trigger: RefObject<HTMLElement | null>,
  placement: keyof typeof PLACEMENT,
): keyof typeof PLACEMENT {
  const [flipped, setFlipped] = useState(false)
  useLayoutEffect(() => {
    if (!open) return setFlipped(false)
    if (!popover.current || !trigger.current) return
    const height = popover.current.getBoundingClientRect().height
    const anchor = trigger.current.getBoundingClientRect()
    const roomAbove = anchor.top - TOP_CLEARANCE
    const roomBelow = window.innerHeight - anchor.bottom - EDGE_GAP
    const [wanted, other] = placement === 'top' ? [roomAbove, roomBelow] : [roomBelow, roomAbove]
    if (height > wanted && height <= other) setFlipped(true)
  }, [open, placement, popover, trigger])
  return flipped ? (placement === 'top' ? 'bottom' : 'top') : placement
}
