import { useId, useState, type FormEvent } from 'react'
import { FolderOpen } from 'lucide-react'
import type { ConnectionDraft, ConnectionExpiry, ConnectionInfo } from '@shared/api'
import { readableError } from '../state/usePuppy'
import { EMPTY_DRAFT, PRODUCTWATCH_DRAFT } from './connectionPresets'
import { BUTTON } from './ui/Page'

const INPUT = 'mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-accent/60 focus:outline-none'

interface Props {
  add: (draft: ConnectionDraft) => Promise<ConnectionInfo[]>
  chooseFile: () => Promise<string | null>
  onDone: () => void
}

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-sm">
        {label}
      </label>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {children}
    </div>
  )
}

/** Adds a token that lives in a file (a `.env`). Puppy reads it to show whose it is and when it ends: it is never copied. */
export function ConnectionForm({ add, chooseFile, onDone }: Props) {
  const id = useId()
  const [draft, setDraft] = useState<ConnectionDraft>(EMPTY_DRAFT)
  const [kind, setKind] = useState<ConnectionExpiry['kind']>('token')
  const [days, setDays] = useState('7')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (change: Partial<ConnectionDraft>) => setDraft((current) => ({ ...current, ...change }))

  const choose = () => void chooseFile().then((file) => file && set({ file }))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const expiry: ConnectionExpiry = kind === 'days' ? { kind, days: Number(days) } : { kind }
    add({ ...draft, expiry }).then(onDone, (failure: unknown) => setError(readableError(failure))).finally(() => setSaving(false))
  }

  return (
    <form aria-label="Add a connection" onSubmit={submit} className="mt-4 space-y-4 rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-muted">Show a token from a file on this Mac, and when it expires. Puppy only reads the file.</p>
        <button type="button" onClick={() => setDraft({ ...PRODUCTWATCH_DRAFT, file: draft.file })} className={BUTTON}>
          Fill in for ProductWatch
        </button>
      </div>

      <Field label="Name" htmlFor={`${id}-name`}>
        <input id={`${id}-name`} value={draft.name} onChange={(event) => set({ name: event.target.value })} maxLength={60} autoComplete="off" className={INPUT} />
      </Field>

      <Field label="File that holds the token" htmlFor={`${id}-file`} hint="A file of NAME=value lines, such as .env.local.">
        <div className="flex gap-2">
          <input id={`${id}-file`} value={draft.file} onChange={(event) => set({ file: event.target.value })} placeholder="/Users/you/project/.env.local" autoComplete="off" spellCheck={false} className={INPUT} />
          <button type="button" onClick={choose} className={`${BUTTON} mt-1 shrink-0`}>
            <FolderOpen size={14} aria-hidden />
            Choose file
          </button>
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Token variable" htmlFor={`${id}-token`} hint="The NAME of the token's line.">
          <input id={`${id}-token`} value={draft.tokenVariable} onChange={(event) => set({ tokenVariable: event.target.value })} placeholder="PW_TOKEN" autoComplete="off" spellCheck={false} className={INPUT} />
        </Field>
        <Field label="Account variable (optional)" htmlFor={`${id}-account`} hint="Whose it is, such as an email.">
          <input id={`${id}-account`} value={draft.accountVariable} onChange={(event) => set({ accountVariable: event.target.value })} placeholder="PW_EMAIL" autoComplete="off" spellCheck={false} className={INPUT} />
        </Field>
      </div>

      <fieldset>
        <legend className="text-sm">How does it expire?</legend>
        {(
          [
            ['token', 'The token says when (most login tokens do)'],
            ['days', 'A fixed number of days after the file last changed'],
            ['none', 'It does not expire'],
          ] as const
        ).map(([option, label]) => (
          <label key={option} className="mt-1.5 flex items-center gap-2 text-sm">
            <input type="radio" name={`${id}-expiry`} checked={kind === option} onChange={() => setKind(option)} />
            {label}
            {option === 'days' && kind === 'days' && (
              <input type="number" aria-label="Days" min={1} max={365} value={days} onChange={(event) => setDays(event.target.value)} className="w-20 rounded-lg border border-line bg-surface px-2 py-1 text-sm" />
            )}
          </label>
        ))}
      </fieldset>

      <Field label="Page to renew it (optional)" htmlFor={`${id}-url`} hint="Opened by the Renew button. Must start with https://">
        <input id={`${id}-url`} value={draft.renewUrl} onChange={(event) => set({ renewUrl: event.target.value })} placeholder="https://" autoComplete="off" spellCheck={false} className={INPUT} />
      </Field>
      <Field label="How to renew it (optional)" htmlFor={`${id}-steps`} hint="Shown when the token is close to ending or has ended.">
        <textarea id={`${id}-steps`} value={draft.renewSteps} onChange={(event) => set({ renewSteps: event.target.value })} rows={4} maxLength={2000} spellCheck={false} className={`${INPUT} font-mono text-xs`} />
      </Field>

      {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-60">
          {saving ? 'Adding...' : 'Add connection'}
        </button>
        <button type="button" onClick={onDone} disabled={saving} className={BUTTON}>
          Cancel
        </button>
      </div>
    </form>
  )
}
