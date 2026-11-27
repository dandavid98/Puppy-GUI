import { useId, useState, type FormEvent } from 'react'
import { BadgeCheck, LockKeyhole } from 'lucide-react'
import type { McpCatalogEntry, McpState } from '@shared/api'
import { readableError } from '../state/usePuppy'
import { AddControl } from './McpSearchList'
import { BUTTON } from './ui/Page'

const INPUT = 'mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-accent/60 focus:outline-none'
const CHIP = 'rounded-md bg-raised px-1.5 py-0.5 text-xs text-muted'

interface Props {
  entry: McpCatalogEntry
  added: boolean
  /** Another server is being added: one at a time. */
  locked: boolean
  onAdd: (values: Record<string, string>) => Promise<McpState>
  onBusy: (busy: boolean) => void
}

/** One server from Code Puppy's catalog. One that needs keys or settings asks for them first; adding starts it once to check it works. */
export function McpCatalogItem({ entry, added, locked, onAdd, onBusy }: Props) {
  const formId = useId()
  const [asking, setAsking] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const add = (values: Record<string, string>) => {
    setChecking(true)
    setError(null)
    onBusy(true)
    onAdd(values)
      .then(() => setAsking(false))
      .catch((failure: unknown) => setError(readableError(failure)))
      .finally(() => {
        setChecking(false)
        onBusy(false)
      })
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    add(Object.fromEntries([...new FormData(event.currentTarget)].map(([name, value]) => [name, String(value)])))
  }
  const hasKeys = entry.fields.some((field) => field.secret)

  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-sm font-medium">{entry.displayName}</h3>
            {entry.verified && <BadgeCheck size={14} className="text-accent" aria-label="Verified" />}
            <span className={CHIP}>{entry.category}</span>
            {entry.deprecated && <span className={CHIP} title="Its authors no longer maintain it. It still runs.">Deprecated</span>}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-muted">{entry.description}</p>
        </div>
        {entry.unavailable && !added ? (
          <span className="shrink-0 px-3 py-1.5 text-sm text-muted">{entry.unavailable}</span>
        ) : (
          !asking && (
            <AddControl
              name={entry.displayName}
              added={added}
              busy={checking}
              disabled={locked}
              onAdd={() => (entry.fields.length ? setAsking(true) : add({}))}
            />
          )
        )}
      </div>

      {asking && (
        <form aria-label={`Settings for ${entry.displayName}`} onSubmit={submit} className="mt-3 space-y-3 rounded-xl border border-line p-4">
          {entry.fields.map((field, index) => (
            <div key={field.name}>
              <label htmlFor={`${formId}-${field.name}`} className="text-sm">
                {field.label}
                {!field.required && <span className="text-muted"> (optional)</span>}
              </label>
              <input
                id={`${formId}-${field.name}`}
                name={field.name}
                type={field.secret ? 'password' : 'text'}
                required={field.required && !field.default}
                placeholder={field.default}
                autoComplete="off"
                spellCheck={false}
                autoFocus={index === 0}
                disabled={checking}
                className={INPUT}
              />
            </div>
          ))}
          {hasKeys && (
            <p className="flex items-start gap-1.5 text-xs text-muted">
              <LockKeyhole size={13} aria-hidden className="mt-px shrink-0" />
              Keys are stored encrypted on this Mac, and given only to this server.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={checking || locked} className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-60">
              {checking ? 'Adding...' : `Add ${entry.displayName}`}
            </button>
            <button type="button" onClick={() => setAsking(false)} disabled={checking} className={BUTTON}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {checking && (
        <p role="status" className="mt-2 text-xs text-muted">
          Starting it once to check it works. The first time can take a minute while it downloads.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm break-words whitespace-pre-line text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
