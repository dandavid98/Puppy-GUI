import { useMemo, useState } from 'react'
import { FolderPlus } from 'lucide-react'
import type { ChatFolder, SessionSummary, WorkspaceKind } from '@shared/api'
import { organize, type FolderView } from '../lib/organize'
import type { PuppyActions } from '../state/usePuppy'
import { FolderRow } from './FolderRow'
import { SessionRow } from './SessionRow'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { InlineEdit } from './ui/InlineEdit'

export type ConversationActions = Pick<
  PuppyActions,
  'open' | 'renameSession' | 'deleteSession' | 'pinSession' | 'moveSession' | 'createFolder' | 'updateFolder' | 'deleteFolder'
>

interface Props {
  sessions: SessionSummary[]
  folders: ChatFolder[]
  mode: WorkspaceKind
  activeId: string | null
  /** A page (Settings, Agents) is showing instead of a conversation: no row is current. */
  pageOpen: boolean
  actions: ConversationActions
}

const HEADING = 'px-2.5 pb-1 text-xs font-medium text-muted'

/** The sidebar's list: pinned conversations, then folders (pinned first), then the rest by day. */
export function ConversationList({ sessions, folders, mode, activeId, pageOpen, actions }: Props) {
  const model = useMemo(() => organize(sessions, folders, mode), [sessions, folders, mode])
  const modeFolders = useMemo(() => folders.filter((folder) => folder.kind === mode), [folders, mode])
  /** Naming a new folder; `sessionId` is set when it came from a conversation's "Move to new folder". */
  const [creating, setCreating] = useState<{ sessionId?: string } | null>(null)
  const [sessionToDelete, setSessionToDelete] = useState<SessionSummary | null>(null)
  const [folderToDelete, setFolderToDelete] = useState<FolderView | null>(null)

  const row = (session: SessionSummary) => (
    <SessionRow
      key={session.sessionId}
      session={session}
      active={!pageOpen && session.sessionId === activeId}
      folders={modeFolders}
      onOpen={() => void actions.open(session)}
      onRename={(title) => actions.renameSession(session.sessionId, title)}
      onPin={(pinned) => void actions.pinSession(session.sessionId, pinned)}
      onMove={(folderId) => void actions.moveSession(session.sessionId, folderId)}
      onNewFolder={() => setCreating({ sessionId: session.sessionId })}
      onDelete={() => setSessionToDelete(session)}
    />
  )

  const keptCount = folderToDelete?.sessions.length ?? 0

  return (
    <nav className="mt-4 min-h-0 flex-1 overflow-y-auto px-2 pb-4" aria-label="Recent conversations">
      {creating ? (
        <div className="px-1 pb-2">
          <InlineEdit
            label="Folder name"
            placeholder="Folder name"
            onSubmit={(name) => actions.createFolder(name, mode, creating.sessionId)}
            onDone={() => setCreating(null)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating({})}
          className="mb-2 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-raised/70 hover:text-ink"
        >
          <FolderPlus size={16} aria-hidden />
          New folder
        </button>
      )}

      {model.total === 0 && <p className="px-2.5 text-sm text-muted">No {mode === 'chat' ? 'chats' : 'code sessions'} yet.</p>}

      {model.pinned.length > 0 && (
        <section aria-label="Pinned" className="mb-4">
          <h2 className={HEADING}>Pinned</h2>
          <ul>{model.pinned.map(row)}</ul>
        </section>
      )}

      {model.folders.length > 0 && (
        <section aria-label="Folders" className="mb-4">
          <h2 className={HEADING}>Folders</h2>
          <ul>
            {model.folders.map((view) => (
              <FolderRow
                key={view.folder.id}
                folder={view.folder}
                count={view.sessions.length}
                onUpdate={(patch) => actions.updateFolder(view.folder.id, patch)}
                onDelete={() => setFolderToDelete(view)}
              >
                {view.sessions.map(row)}
              </FolderRow>
            ))}
          </ul>
        </section>
      )}

      {model.recent.map((group) => (
        <section key={group.label} className="mb-4">
          <h2 className={HEADING}>{group.label}</h2>
          <ul>{group.sessions.map(row)}</ul>
        </section>
      ))}

      <ConfirmDialog
        open={sessionToDelete !== null}
        title="Delete conversation?"
        message={`"${sessionToDelete?.title ?? 'Untitled'}" and its history will be permanently deleted.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setSessionToDelete(null)}
        onConfirm={() => {
          if (sessionToDelete) void actions.deleteSession(sessionToDelete.sessionId)
          setSessionToDelete(null)
        }}
      />
      <ConfirmDialog
        open={folderToDelete !== null}
        title="Delete folder?"
        message={
          keptCount === 0
            ? `The folder "${folderToDelete?.folder.name}" will be deleted.`
            : `The folder "${folderToDelete?.folder.name}" will be deleted. Its ${keptCount === 1 ? 'conversation is' : `${keptCount} conversations are`} kept and move back to your list.`
        }
        confirmLabel="Delete folder"
        danger
        onCancel={() => setFolderToDelete(null)}
        onConfirm={() => {
          if (folderToDelete) void actions.deleteFolder(folderToDelete.folder.id)
          setFolderToDelete(null)
        }}
      />
    </nav>
  )
}
