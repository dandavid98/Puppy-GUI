import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, Plus, RotateCw, Search } from 'lucide-react'
import { readableError } from '../state/usePuppy'
import { BUTTON, SEARCH_INPUT, Section } from './ui/Page'

/** Enough to scan; searching narrows the rest. */
const SHOWN = 40

interface Props<T> {
  title: string
  /** What is being read, for messages: "the marketplace". */
  what: string
  load: () => Promise<T[]>
  describe: (items: T[]) => string
  searchLabel: string
  placeholder: string
  listLabel: string
  /** The words a search looks through. */
  searchText: (item: T) => string
  keyOf: (item: T) => string
  children: (item: T) => ReactNode
}

/** A card listing servers from one source: read once, searchable, retried on failure. */
export function McpSearchList<T>({ title, what, load, describe, searchLabel, placeholder, listLabel, searchText, keyOf, children }: Props<T>) {
  const [items, setItems] = useState<T[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const read = useCallback(() => {
    setError(null)
    load().then(setItems, (failure: unknown) => setError(readableError(failure)))
  }, [load])
  useEffect(read, [read])

  const found = useMemo(() => {
    const wanted = query.trim().toLowerCase()
    return items?.filter((item) => searchText(item).toLowerCase().includes(wanted)) ?? []
  }, [items, query, searchText])

  return (
    <Section title={title} description={items ? describe(items) : undefined}>
      {error ? (
        <div>
          <p className="text-sm text-danger">Could not read {what}: {error}</p>
          <button type="button" onClick={read} className={`${BUTTON} mt-3`}>
            <RotateCw size={14} aria-hidden />
            Try again
          </button>
        </div>
      ) : !items ? (
        <p role="status" className="text-sm text-muted">Loading {what}...</p>
      ) : (
        <>
          <div className="relative">
            <Search size={15} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input type="search" aria-label={searchLabel} placeholder={placeholder} value={query} onChange={(event) => setQuery(event.target.value)} className={SEARCH_INPUT} />
          </div>
          <ul aria-label={listLabel} className="mt-3 divide-y divide-line">
            {found.slice(0, SHOWN).map((item) => (
              <li key={keyOf(item)} className="py-3">
                {children(item)}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            {found.length > SHOWN ? `Showing ${SHOWN} of ${found.length}. Search to find others.` : found.length ? null : `Nothing matches "${query}".`}
          </p>
        </>
      )}
    </Section>
  )
}

/** "Added", or the button that adds it. */
export function AddControl({ name, added, busy, disabled, onAdd }: { name: string; added: boolean; busy: boolean; disabled: boolean; onAdd: () => void }) {
  if (added) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 px-3 py-1.5 text-sm text-muted">
        <Check size={14} aria-hidden />
        Added
      </span>
    )
  }
  return (
    <button type="button" onClick={onAdd} disabled={disabled} aria-label={`Add ${name}`} className={`${BUTTON} shrink-0`}>
      <Plus size={14} aria-hidden />
      {busy ? 'Adding...' : 'Add'}
    </button>
  )
}
