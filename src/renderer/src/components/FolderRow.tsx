import { useState, type ReactNode } from 'react'
import { ChevronRight, Ellipsis, Folder, FolderOpen, PencilLine, Pin, PinOff, Trash } from 'lucide-react'
import type { ChatFolder, FolderPatch } from '@shared/api'
import { InlineEdit } from './ui/InlineEdit'
import { Menu } from './ui/Menu'

interface Props {
  folder: ChatFolder
  count: number
  onUpdate: (patch: FolderPatch) => Promise<boolean>
  onDelete: () => void
  /** The conversations inside, as rows. */
  children: ReactNode
}

/** A user folder in the sidebar: click to open or close it, "..." to rename, pin or delete it. */
export function FolderRow({ folder, count, onUpdate, onDelete, children }: Props) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <li className="px-1 py-0.5">
        <InlineEdit value={folder.name} label="Folder name" onSubmit={(name) => onUpdate({ name })} onDone={() => setEditing(false)} />
      </li>
    )
  }

  const FolderIcon = folder.collapsed ? Folder : FolderOpen
  return (
    <li>
      <div className="group relative">
        <button
          type="button"
          onClick={() => void onUpdate({ collapsed: !folder.collapsed })}
          aria-expanded={!folder.collapsed}
          className="flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-8 pl-1.5 text-left text-sm text-muted hover:bg-raised/70 hover:text-ink"
        >
          <ChevronRight size={14} aria-hidden className={`shrink-0 transition-transform ${folder.collapsed ? '' : 'rotate-90'}`} />
          <FolderIcon size={15} aria-hidden className="shrink-0" />
          <span className="min-w-0 flex-1 truncate text-ink">{folder.name}</span>
          {folder.pinned && (
            <>
              <Pin size={11} aria-hidden className="shrink-0" />
              <span className="sr-only">, pinned</span>
            </>
          )}
          <span aria-hidden className="text-xs tabular-nums">
            {count}
          </span>
        </button>
        <div className="absolute top-1.5 right-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100">
          <Menu
            label={`Options for folder ${folder.name}`}
            trigger={<Ellipsis size={16} aria-hidden />}
            triggerClassName="rounded-md p-1 text-muted hover:bg-line hover:text-ink"
            items={[
              folder.pinned
                ? { label: 'Unpin folder', icon: PinOff, onSelect: () => void onUpdate({ pinned: false }) }
                : { label: 'Pin folder', icon: Pin, onSelect: () => void onUpdate({ pinned: true }) },
              { label: 'Rename folder', icon: PencilLine, onSelect: () => setEditing(true) },
              { label: 'Delete folder', icon: Trash, onSelect: onDelete, danger: true },
            ]}
          />
        </div>
      </div>
      {!folder.collapsed && (
        <ul aria-label={`${folder.name} conversations`} className="ml-4 border-l border-line pl-1">
          {count === 0 ? <li className="px-2.5 py-1 text-xs text-muted">Empty. Use a conversation's ... menu to add one.</li> : children}
        </ul>
      )}
    </li>
  )
}
