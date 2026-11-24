import { useState } from 'react'
import { Ellipsis, FolderInput, FolderMinus, FolderPlus, PencilLine, Pin, PinOff, Trash } from 'lucide-react'
import type { ChatFolder, SessionSummary } from '@shared/api'
import { folderName } from '../lib/format'
import { InlineEdit } from './ui/InlineEdit'
import { Menu, type MenuItem } from './ui/Menu'

interface Props {
  session: SessionSummary
  active: boolean
  /** The folders this conversation could be filed in: its own tab's. */
  folders: ChatFolder[]
  onOpen: () => void
  onRename: (title: string) => Promise<boolean>
  onPin: (pinned: boolean) => void
  onMove: (folderId: string | null) => void
  onNewFolder: () => void
  onDelete: () => void
}

/** One conversation in the sidebar: click to open, "..." to pin, rename, file in a folder or delete. */
export function SessionRow({ session, active, folders, onOpen, onRename, onPin, onMove, onNewFolder, onDelete }: Props) {
  const [editing, setEditing] = useState(false)
  const title = session.title ?? 'Untitled'

  if (editing) {
    return (
      <li className="px-1 py-0.5">
        <InlineEdit value={title} label="Conversation title" onSubmit={onRename} onDone={() => setEditing(false)} />
      </li>
    )
  }

  const items: MenuItem[] = [
    session.pinned ? { label: 'Unpin', icon: PinOff, onSelect: () => onPin(false) } : { label: 'Pin', icon: Pin, onSelect: () => onPin(true) },
    { label: 'Rename', icon: PencilLine, onSelect: () => setEditing(true) },
    ...folders
      .filter((folder) => folder.id !== session.folderId)
      .map((folder): MenuItem => ({ label: `Move to ${folder.name}`, icon: FolderInput, onSelect: () => onMove(folder.id) })),
    { label: 'Move to new folder...', icon: FolderPlus, onSelect: onNewFolder },
    ...(session.folderId ? [{ label: 'Remove from folder', icon: FolderMinus, onSelect: () => onMove(null) }] : []),
    { label: 'Delete', icon: Trash, onSelect: onDelete, danger: true },
  ]

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? 'true' : undefined}
        className={`w-full rounded-lg py-1.5 pr-8 pl-2.5 text-left text-sm ${active ? 'bg-raised' : 'hover:bg-raised/70'}`}
      >
        <span className="flex items-center gap-1.5">
          {session.pinned && (
            <>
              <Pin size={11} aria-hidden className="shrink-0 text-muted" />
              <span className="sr-only">Pinned: </span>
            </>
          )}
          <span className="truncate">{title}</span>
        </span>
        {session.kind === 'code' && <span className="block truncate text-xs text-muted">{folderName(session.cwd)}</span>}
      </button>
      <div className="absolute top-1.5 right-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100">
        <Menu
          label={`Options for ${title}`}
          trigger={<Ellipsis size={16} aria-hidden />}
          triggerClassName="rounded-md p-1 text-muted hover:bg-line hover:text-ink"
          items={items}
        />
      </div>
    </li>
  )
}
