import { useEffect, useRef, useState } from 'react'

interface Props {
  /** What it starts with: the current name when renaming, nothing when naming something new. */
  value?: string
  label: string
  placeholder?: string
  /** Say `false` when it did not work: the box then stays open, so nothing typed is lost. */
  onSubmit: (text: string) => void | boolean | Promise<boolean | void>
  /** Time to go back to the normal row: it was saved, cancelled or left alone. */
  onDone: () => void
}

/** A one-line name box for rows in the sidebar: Enter or clicking away saves, Escape cancels. */
export function InlineEdit({ value = '', label, placeholder, onSubmit, onDone }: Props) {
  const [draft, setDraft] = useState(value)
  const input = useRef<HTMLInputElement>(null)
  const saving = useRef(false)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  const commit = async () => {
    if (saving.current) return // Enter then blur must not save twice
    const text = draft.trim()
    if (!text || text === value) return onDone()
    saving.current = true
    const result = await onSubmit(text)
    saving.current = false
    if (result === false) input.current?.focus()
    else onDone()
  }

  return (
    <input
      ref={input}
      value={draft}
      aria-label={label}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') void commit()
        if (event.key === 'Escape') onDone()
      }}
      className="w-full rounded-lg border border-accent/60 bg-surface px-2 py-1.5 text-sm focus:outline-none"
    />
  )
}
