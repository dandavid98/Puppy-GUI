import { Bot, CircleArrowUp, CodeXml, MessagesSquare, Moon, PanelLeftClose, PawPrint, Plus, Settings as SettingsIcon, Sun } from 'lucide-react'
import type { AgentStatus, ChatFolder, SessionSummary, ThemePreference, WorkspaceKind } from '@shared/api'
import { useDarkMode } from '../lib/useDarkMode'
import type { AppState } from '../state/store'
import { ConversationList, type ConversationActions } from './ConversationList'

interface Props {
  sessions: SessionSummary[]
  folders: ChatFolder[]
  activeId: string | null
  mode: WorkspaceKind
  status: AgentStatus
  view: AppState['view']
  /** A newer Puppy is waiting: show the badge. */
  updateAvailable: boolean
  onUpdate: () => void
  onNew: (kind: WorkspaceKind) => void
  actions: ConversationActions
  onTheme: (theme: ThemePreference) => void
  onSettings: () => void
  onAgents: () => void
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
  const { sessions, folders, activeId, mode, status, view, updateAvailable, onUpdate, actions, onNew, onTheme, onSettings, onAgents, onCollapse } = props
  const inConversation = view === 'conversation'
  const settingsOpen = view === 'settings'
  const dark = useDarkMode()

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
        <NavItem active={inConversation && mode === 'chat'} icon={MessagesSquare} label="Chat" onClick={() => onNew('chat')} />
        <NavItem active={inConversation && mode === 'code'} icon={CodeXml} label="Code" onClick={() => onNew('code')} />
        <NavItem active={view === 'agents'} icon={Bot} label="Agents" onClick={onAgents} />
      </div>

      <ConversationList sessions={sessions} folders={folders} mode={mode} activeId={activeId} pageOpen={!inConversation} actions={actions} />

      <div className="flex items-center gap-1 border-t border-line py-2 pr-2 pl-4">
        <span role="status" className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted">
          <span aria-hidden className={`size-2 shrink-0 rounded-full ${STATUS_DOT[status.state]}`} />
          <span className="truncate">{STATUS_TEXT[status.state]}</span>
        </span>
        {updateAvailable && (
          <button
            type="button"
            onClick={onUpdate}
            aria-label="Update available: update Puppy"
            title="Update ready. Click to update Puppy"
            className={`${ICON_BUTTON} relative text-accent hover:text-accent`}
          >
            <CircleArrowUp size={16} aria-hidden />
            <span aria-hidden className="absolute top-1 right-1 size-1.5 rounded-full bg-accent ring-2 ring-sidebar" />
          </button>
        )}
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
    </aside>
  )
}
