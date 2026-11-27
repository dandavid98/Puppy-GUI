import { useCallback, useEffect, useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import type { ConnectionDraft, ConnectionFileVariable, ConnectionInfo, McpState } from '@shared/api'
import { readableError } from '../state/usePuppy'
import { ConnectionForm } from './ConnectionForm'
import { ConnectionRow } from './ConnectionRow'
import { BUTTON, Section } from './ui/Page'

interface Props {
  /** Changes when the Walmart sign-in does: the list is read again. */
  signedIn: boolean | null | undefined
  list: () => Promise<ConnectionInfo[]>
  add: (draft: ConnectionDraft) => Promise<ConnectionInfo[]>
  remove: (id: string) => Promise<ConnectionInfo[]>
  chooseFile: () => Promise<string | null>
  inspectFile: (file: string) => Promise<ConnectionFileVariable[]>
  preview: (draft: ConnectionDraft) => Promise<ConnectionInfo | null>
  openRenewal: (id: string) => Promise<void>
  signIn: () => Promise<McpState>
}

/** How often "expires in 6d 16h" is worked out again. */
const TICK_MS = 60_000

/** What the user's logins and keys are, and when each ends. Read again whenever the window regains focus: a token is often renewed in another app. */
export function ConnectionsSection({ signedIn, list, add, remove, chooseFile, inspectFile, preview, openRenewal, signIn }: Props) {
  const [rows, setRows] = useState<ConnectionInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now)
  const [renewing, setRenewing] = useState<string | null>(null)
  const [waiting, setWaiting] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(() => {
    setNow(Date.now())
    list().then(
      (read) => {
        setRows(read)
        setError(null)
      },
      (failure: unknown) => setError(readableError(failure)),
    )
  }, [list])

  useEffect(load, [load, signedIn])
  useEffect(() => {
    window.addEventListener('focus', load)
    const tick = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => {
      window.removeEventListener('focus', load)
      clearInterval(tick)
    }
  }, [load])

  const attempt = (work: () => Promise<unknown>) => {
    setError(null)
    return work().catch((failure: unknown) => setError(readableError(failure)))
  }
  const renew = (connection: ConnectionInfo) => {
    if (!connection.renew?.signIn) return setRenewing(renewing === connection.id ? null : connection.id)
    setWaiting(connection.id)
    void attempt(signIn).finally(() => {
      setWaiting(null)
      load()
    })
  }

  return (
    <Section
      title="Connections"
      description="The logins and keys Puppy and your tools rely on, and when each one ends. Puppy only reads them, and never shows a token."
      action={
        <div className="flex gap-2">
          <button type="button" onClick={load} aria-label="Check connections again" title="Check again" className="rounded-md p-1.5 text-muted hover:bg-raised">
            <RefreshCw size={15} aria-hidden />
          </button>
          {!adding && (
            <button type="button" onClick={() => setAdding(true)} className={BUTTON}>
              <Plus size={14} aria-hidden />
              Add connection
            </button>
          )}
        </div>
      }
    >
      {error && <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      {!rows ? (
        <p role="status" className="text-sm text-muted">Checking your connections...</p>
      ) : (
        <ul aria-label="Connections" className="divide-y divide-line">
          {rows.map((connection) => (
            <ConnectionRow
              key={connection.id}
              connection={connection}
              now={now}
              open={renewing === connection.id}
              waiting={waiting === connection.id}
              onRenew={() => renew(connection)}
              onRecheck={load}
              onOpenPage={() => void attempt(() => openRenewal(connection.id))}
              onRemove={() => void attempt(() => remove(connection.id).then(setRows))}
            />
          ))}
        </ul>
      )}
      {adding && (
        <ConnectionForm
          add={add}
          chooseFile={chooseFile}
          inspectFile={inspectFile}
          preview={preview}
          onDone={() => {
            setAdding(false)
            load()
          }}
        />
      )}
    </Section>
  )
}
