import { useState } from 'react'
import { CodeXml, MessagesSquare, Moon, PanelLeftClose, PawPrint, Plus, Settings as SettingsIcon, Sun } from 'lucide-react'
import type { AgentStatus, SessionSummary, ThemePreference, WorkspaceKind } from '@shared/api'
import { groupByRecency } from '../lib/format'
import { useDarkMode } from '../lib/useDarkMode'
import { SessionRow } from './SessionRow'
import { ConfirmDialog } from './ui/ConfirmDialog'

interface Props {
  sessions: SessionSummary[]
  activeId: string | null
  mode: WorkspaceKind
  status: AgentStatus
  settingsOpen: boolean
  onNew: (kind: WorkspaceKind) => void
  onOpen: (session: SessionSummary) => void
  onRename: (sessionId: string, title: string) => void
  onDelete: (sessionId: string) => void
  onTheme: (theme: ThemePreference) => void
  onSettings: () => void
  onCollapse: () => void
}

const STATUS_TEXT: Record<AgentStatus['state'], string> = {
  starting: 'Waking up...',
  ready: 'Code Puppy is ready',
  error: 'Code Puppy is offline',
}
const STATUS_DOT: Record<AgentStatus['state'], string> = {
  starting: 'bg-amber-400 animate-pulse',
  ready: 'bg-emerald-500',
  error: 'bg-red-500',
}
const ICON_BUTTON = 'rounded-md p-1.5 text-muted hover:bg-raised hover:text-ink'

function NavItem({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof CodeXml; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm ${active ? 'bg-raised font-medium' : 'text-muted hover:bg-raised/70 hover:text-ink'}`}
    >
      <Icon size={16} aria-hidden />
      {label}
    </button>
  )
}

export function Sidebar(props: Props) {
  const { sessions, activeId, mode, status, settingsOpen, onNew, onOpen, onRename, onDelete, onTheme, onSettings, onCollapse } = props
  const [toDelete, setToDelete] = useState<SessionSummary | null>(null)
  const dark = useDarkMode()
  const groups = groupByRecency(sessions.filter((session) => session.kind === mode))

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-sidebar" aria-label="Conversations">
      <div className="drag flex h-12 items-center justify-end px-2">
        <button type="button" onClick={onCollapse} aria-label="Hide sidebar" className={ICON_BUTTON}>
          <PanelLeftClose size={17} aria-hidden />
        </button>
      </div>

      <div className="flex items-center gap-2 px-4 pb-3">
        <PawPrint size={20} aria-hidden className="text-accent" />
        <span className="font-serif text-xl tracking-tight">Puppy</span>
      </div>

      <div className="space-y-0.5 px-2">
        <button
          type="button"
          onClick={() => onNew(mode)}
          className="mb-2 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium hover:bg-raised"
        >
          <span className="grid size-5 place-items-center rounded-full bg-accent text-on-accent">
            <Plus size={14} aria-hidden />
          </span>
          {mode === 'chat' ? 'New chat' : 'New code session'}
        </button>
        <NavItem active={!settingsOpen && mode === 'chat'} icon={MessagesSquare} label="Chat" onClick={() => onNew('chat')} />
        <NavItem active={!settingsOpen && mode === 'code'} icon={CodeXml} label="Code" onClick={() => onNew('code')} />
      </div>

      <nav className="mt-4 min-h-0 flex-1 overflow-y-auto px-2 pb-4" aria-label="Recent conversations">
        {groups.length === 0 && <p className="px-2.5 text-sm text-muted">No {mode === 'chat' ? 'chats' : 'code sessions'} yet.</p>}
        {groups.map((group) => (
          <section key={group.label} className="mb-4">
            <h2 className="px-2.5 pb-1 text-xs font-medium text-muted">{group.label}</h2>
            <ul>
              {group.sessions.map((session) => (
                <SessionRow
                  key={session.sessionId}
                  session={session}
                  active={!settingsOpen && session.sessionId === activeId}
                  onOpen={() => onOpen(session)}
                  onRename={(title) => onRename(session.sessionId, title)}
                  onDelete={() => setToDelete(session)}
                />
              ))}
            </ul>
          </section>
        ))}
      </nav>

      <div className="flex items-center gap-1 border-t border-line py-2 pr-2 pl-4">
        <span role="status" className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted">
          <span aria-hidden className={`size-2 shrink-0 rounded-full ${STATUS_DOT[status.state]}`} />
          <span className="truncate">{STATUS_TEXT[status.state]}</span>
        </span>
        <button
          type="button"
          onClick={() => onTheme(dark ? 'light' : 'dark')}
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={dark ? 'Light mode' : 'Dark mode'}
          className={ICON_BUTTON}
        >
          {dark ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
        </button>
        <button
          type="button"
          onClick={onSettings}
          aria-label="Settings"
          aria-current={settingsOpen ? 'page' : undefined}
          title="Settings"
          className={`${ICON_BUTTON} ${settingsOpen ? 'bg-raised text-ink' : ''}`}
        >
          <SettingsIcon size={16} aria-hidden />
        </button>
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete conversation?"
        message={`"${toDelete?.title ?? 'Untitled'}" and its history will be permanently deleted.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) onDelete(toDelete.sessionId)
          setToDelete(null)
        }}
      />
    </aside>
  )
}
