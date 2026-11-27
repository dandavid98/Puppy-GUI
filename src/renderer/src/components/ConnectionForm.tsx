import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { FolderOpen } from 'lucide-react'
import type { ConnectionDraft, ConnectionExpiry, ConnectionFileVariable, ConnectionInfo } from '@shared/api'
import { guessVariables } from '@shared/connections'
import { readableError } from '../state/usePuppy'
import { statusLine } from './ConnectionRow'
import { BUTTON } from './ui/Page'

const INPUT = 'mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-accent/60 focus:outline-none'
/** How long after typing a path Puppy looks at the file. */
const TYPING_MS = 400

interface Props {
  add: (draft: ConnectionDraft) => Promise<ConnectionInfo[]>
  chooseFile: () => Promise<string | null>
  inspectFile: (file: string) => Promise<ConnectionFileVariable[]>
  preview: (draft: ConnectionDraft) => Promise<ConnectionInfo | null>
  onDone: () => void
}

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor: string; children: ReactNode }) {
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

/** The folder a file is in: a fair first name for what it connects to. */
const folderName = (file: string) => file.split('/').filter(Boolean).slice(-2, -1)[0] ?? ''

/**
 * Adds a token that lives in a file of NAME=value lines (a .env). The user picks
 * the file; Puppy reads the line names (never values), guesses which is the token
 * and whose it is, and previews the result, so for most files it is one confirm.
 */
export function ConnectionForm({ add, chooseFile, inspectFile, preview, onDone }: Props) {
  const id = useId()
  const [file, setFile] = useState('')
  const [variables, setVariables] = useState<ConnectionFileVariable[] | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const nameTyped = useRef(false)
  const [tokenVariable, setTokenVariable] = useState('')
  const [accountVariable, setAccountVariable] = useState('')
  const [kind, setKind] = useState<ConnectionExpiry['kind'] | null>(null)
  const [days, setDays] = useState('7')
  const [renewUrl, setRenewUrl] = useState('')
  const [renewSteps, setRenewSteps] = useState('')
  const [shown, setShown] = useState<ConnectionInfo | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selfExpiring = (variable: string) => variables?.find((candidate) => candidate.name === variable)?.selfExpiring === true
  const expiry: ConnectionExpiry | null = kind === 'days' ? { kind, days: Number(days) } : kind ? { kind } : null
  const draft: ConnectionDraft | null = expiry && tokenVariable ? { name, file, tokenVariable, accountVariable, expiry, renewUrl, renewSteps } : null

  // Look at the file shortly after its path stops changing, and offer what is in it.
  useEffect(() => {
    setVariables(null)
    setShown(null)
    setFileError(null)
    if (!file.trim()) return
    let current = true
    const timer = setTimeout(() => {
      inspectFile(file.trim()).then(
        (found) => {
          if (!current) return
          const guess = guessVariables(found)
          setVariables(found)
          setTokenVariable(guess.token)
          setAccountVariable(guess.account)
          setKind(found.find((variable) => variable.name === guess.token)?.selfExpiring ? 'token' : null)
          if (!nameTyped.current) setName(folderName(file))
        },
        (failure: unknown) => current && setFileError(readableError(failure)),
      )
    }, TYPING_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [file, inspectFile])

  // Show how it would look before it is saved.
  useEffect(() => {
    if (!draft) return setShown(null)
    let current = true
    void preview(draft).then((result) => current && setShown(result), () => current && setShown(null))
    return () => {
      current = false
    }
    // The draft is rebuilt every render; its parts, listed here, are what matter.
  }, [file, tokenVariable, accountVariable, kind, days, preview])

  const chooseToken = (variable: string) => {
    setTokenVariable(variable)
    setKind(selfExpiring(variable) ? 'token' : kind === 'token' ? null : kind)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!draft) return
    setSaving(true)
    setError(null)
    add(draft).then(onDone, (failure: unknown) => setError(readableError(failure))).finally(() => setSaving(false))
  }
  const ready = !!draft && name.trim() !== '' && !saving

  return (
    <form aria-label="Add a connection" onSubmit={submit} className="mt-4 space-y-4 rounded-xl border border-line p-4">
      <p className="text-sm text-muted">
        Show a token that lives in a file on this Mac, and when it expires. Puppy only reads the file, and only the names of its lines.
      </p>

      <Field label="File that holds the token" htmlFor={`${id}-file`} hint="A file of NAME=value lines, such as .env.local.">
        <div className="flex gap-2">
          <input id={`${id}-file`} value={file} onChange={(event) => setFile(event.target.value)} placeholder="/Users/you/project/.env.local" autoComplete="off" spellCheck={false} className={INPUT} />
          <button type="button" onClick={() => void chooseFile().then((chosen) => chosen && setFile(chosen))} className={`${BUTTON} mt-1 shrink-0`}>
            <FolderOpen size={14} aria-hidden />
            Choose file
          </button>
        </div>
        {fileError && <p role="alert" className="mt-2 text-sm text-danger">{fileError}</p>}
      </Field>

      {variables && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Which line is the token?" htmlFor={`${id}-token`}>
              <select id={`${id}-token`} value={tokenVariable} onChange={(event) => chooseToken(event.target.value)} className={INPUT}>
                <option value="">Choose a line</option>
                {variables.map((variable) => (
                  <option key={variable.name} value={variable.name}>
                    {variable.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Which line says whose it is? (optional)" htmlFor={`${id}-account`}>
              <select id={`${id}-account`} value={accountVariable} onChange={(event) => setAccountVariable(event.target.value)} className={INPUT}>
                <option value="">None</option>
                {variables.filter((variable) => variable.name !== tokenVariable).map((variable) => (
                  <option key={variable.name} value={variable.name}>
                    {variable.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Name" htmlFor={`${id}-name`}>
            <input
              id={`${id}-name`}
              value={name}
              onChange={(event) => {
                nameTyped.current = true
                setName(event.target.value)
              }}
              maxLength={60}
              autoComplete="off"
              className={INPUT}
            />
          </Field>

          <fieldset>
            <legend className="text-sm">How does it expire?</legend>
            {tokenVariable && !selfExpiring(tokenVariable) && <p className="text-xs text-muted">This token does not say when it ends, so tell Puppy.</p>}
            {(
              [
                ['token', 'The token says when', !selfExpiring(tokenVariable)],
                ['days', 'A fixed number of days after the file last changed', false],
                ['none', 'It does not expire', false],
              ] as const
            ).map(([option, label, disabled]) => (
              <label key={option} className={`mt-1.5 flex items-center gap-2 text-sm ${disabled ? 'text-muted' : ''}`}>
                <input type="radio" name={`${id}-expiry`} checked={kind === option} disabled={disabled} onChange={() => setKind(option)} />
                {label}
                {option === 'days' && kind === 'days' && (
                  <input type="number" aria-label="Days" min={1} max={365} value={days} onChange={(event) => setDays(event.target.value)} className="w-20 rounded-lg border border-line bg-surface px-2 py-1 text-sm" />
                )}
              </label>
            ))}
          </fieldset>

          <div aria-live="polite" className="rounded-lg bg-raised px-3 py-2 text-sm">
            <span className="text-xs text-muted">Preview</span>
            {shown ? (
              <p>
                <span className="font-medium">{name.trim() || shown.name}</span>
                {shown.account && <span className="text-muted"> · {shown.account}</span>}
                <br />
                {statusLine(shown, Date.now())}
                {shown.note && <span className="text-muted"> · {shown.note}</span>}
              </p>
            ) : (
              <p className="text-muted">Choose the token line and how it expires to see it.</p>
            )}
          </div>

          <details className="rounded-lg border border-line px-3 py-2">
            <summary className="cursor-pointer text-sm">Help renewing it (optional)</summary>
            <div className="mt-3 space-y-4">
              <Field label="Page to renew it" htmlFor={`${id}-url`} hint="Opened by the Renew button. Must start with https://">
                <input id={`${id}-url`} value={renewUrl} onChange={(event) => setRenewUrl(event.target.value)} placeholder="https://" autoComplete="off" spellCheck={false} className={INPUT} />
              </Field>
              <Field label="How to renew it" htmlFor={`${id}-steps`} hint="Shown when the token is close to ending or has ended.">
                <textarea id={`${id}-steps`} value={renewSteps} onChange={(event) => setRenewSteps(event.target.value)} rows={4} maxLength={2000} spellCheck={false} className={`${INPUT} font-mono text-xs`} />
              </Field>
            </div>
          </details>

        </>
      )}

      {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={!ready} className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-60">
          {saving ? 'Adding...' : 'Add connection'}
        </button>
        <button type="button" onClick={onDone} disabled={saving} className={BUTTON}>
          Cancel
        </button>
      </div>
    </form>
  )
}
