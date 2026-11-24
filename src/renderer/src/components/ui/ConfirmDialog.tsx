import { useEffect, useRef } from 'react'

interface Props {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Built on the native <dialog> element: focus trapping, Escape to close and
 * the inert backdrop come from the browser, so there's nothing to get wrong.
 */
export function ConfirmDialog({ open, title, message, confirmLabel, danger, onConfirm, onCancel }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = dialog.current
    if (open && !element?.open) element?.showModal()
    if (!open && element?.open) element.close()
  }, [open])

  return (
    <dialog
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
      aria-labelledby="confirm-title"
      className="m-auto w-96 rounded-2xl border border-line bg-surface p-6 text-ink shadow-[0_20px_60px_rgba(0,0,0,0.25)] backdrop:bg-black/30"
    >
      <h2 id="confirm-title" className="text-base font-semibold">
        {title}
      </h2>
      <p className="mt-2 text-sm text-muted">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-line px-3.5 py-1.5 text-sm hover:bg-raised">
          Cancel
        </button>
        <button
          type="button"
          autoFocus
          onClick={onConfirm}
          className={`rounded-lg px-3.5 py-1.5 text-sm font-medium ${danger ? 'bg-danger text-white hover:opacity-90' : 'bg-accent text-on-accent hover:opacity-90'}`}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
