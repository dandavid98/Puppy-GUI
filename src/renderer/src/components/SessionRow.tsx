import { useEffect, useRef, useState } from 'react'
import { Ellipsis, PencilLine, Trash } from 'lucide-react'
import type { SessionSummary } from '@shared/api'
import { folderName } from '../lib/format'
import { Menu } from './ui/Menu'

interface Props {
  session: SessionSummary
  active: boolean
  onOpen: () => void
  onRename: (title: string) => void
  onDelete: () => void
}

/** One conversation in the sidebar: click to open, "..." for rename/delete, inline rename. */
export function SessionRow({ session, active, onOpen, onRename, onDelete }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const title = session.title ?? 'Untitled'

  useEffect(() => {
    if (editing) input.current?.select()
  }, [editing])

  const startRename = () => {
    setDraft(title)
    setEditing(true)
  }
  const commit = () => {
    setEditing(false)
    if (draft.trim() && draft.trim() !== title) onRename(draft.trim())
  }

  if (editing) {
    return (
      <li className="px-1 py-0.5">
        <input
          ref={input}
          value={draft}
          aria-label="Conversation title"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
            if (event.key === 'Escape') setEditing(false)
          }}
          className="w-full rounded-lg border border-accent/60 bg-surface px-2 py-1.5 text-sm focus:outline-none"
        />
      </li>
    )
  }

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? 'true' : undefined}
        className={`w-full rounded-lg py-1.5 pr-8 pl-2.5 text-left text-sm ${active ? 'bg-raised' : 'hover:bg-raised/70'}`}
      >
        <span className="block truncate">{title}</span>
        {session.kind === 'code' && <span className="block truncate text-xs text-muted">{folderName(session.cwd)}</span>}
      </button>
      <div className="absolute top-1.5 right-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100">
        <Menu
          label={`Options for ${title}`}
          trigger={<Ellipsis size={16} aria-hidden />}
          triggerClassName="rounded-md p-1 text-muted hover:bg-line hover:text-ink"
          items={[
            { label: 'Rename', icon: PencilLine, onSelect: startRename },
            { label: 'Delete', icon: Trash, onSelect: onDelete, danger: true },
          ]}
        />
      </div>
    </li>
  )
}
