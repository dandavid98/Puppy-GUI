import { FolderOpen, LoaderCircle, PanelLeftOpen, Plus, RotateCw, X } from 'lucide-react'
import type { AgentStatus } from '@shared/api'
import { prettyPath } from '../lib/format'

interface TopBarProps {
  sidebarOpen: boolean
  onShowSidebar: () => void
  onNew: () => void
  title: string | null
  folder: string | null
}

export function TopBar({ sidebarOpen, onShowSidebar, onNew, title, folder }: TopBarProps) {
  return (
    <header className={`drag flex h-12 shrink-0 items-center gap-2 pr-4 ${sidebarOpen ? 'pl-4' : 'pl-20'}`}>
      {!sidebarOpen && (
        <>
          <button type="button" onClick={onShowSidebar} aria-label="Show sidebar" className="rounded-md p-1.5 text-muted hover:bg-raised hover:text-ink">
            <PanelLeftOpen size={17} aria-hidden />
          </button>
          <button type="button" onClick={onNew} aria-label="New conversation" className="rounded-md p-1.5 text-muted hover:bg-raised hover:text-ink">
            <Plus size={17} aria-hidden />
          </button>
        </>
      )}
      {title && <h1 className="max-w-[60%] shrink-0 truncate text-sm font-medium">{title}</h1>}
      {folder && (
        <span className="inline-flex min-w-0 items-center gap-1 rounded-md bg-raised px-2 py-0.5 font-mono text-xs text-muted" title={folder}>
          <FolderOpen size={13} aria-hidden />
          <span className="truncate">{prettyPath(folder)}</span>
        </span>
      )}
    </header>
  )
}

interface BannerProps {
  status: AgentStatus
  notice: string | null
  onRetry: () => void
  onDismiss: () => void
}

/** Agent start-up, outages, and errors that have no thread to live in. */
export function Banners({ status, notice, onRetry, onDismiss }: BannerProps) {
  return (
    <div aria-live="polite" className="mx-auto w-full max-w-3xl space-y-2 px-6 empty:hidden">
      {status.state === 'starting' && (
        <div className="flex items-center justify-center gap-2 py-1 text-sm text-muted">
          <LoaderCircle size={14} aria-hidden className="animate-spin" />
          Waking up the puppy...
        </div>
      )}
      {status.state === 'error' && (
        <div role="alert" className="flex items-center gap-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          <span className="min-w-0 flex-1">{status.message}</span>
          <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-lg border border-danger/40 px-2.5 py-1 font-medium hover:bg-danger/10">
            <RotateCw size={14} aria-hidden />
            Retry
          </button>
        </div>
      )}
      {notice && (
        <div role="alert" className="flex items-center gap-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          <span className="min-w-0 flex-1">{notice}</span>
          <button type="button" onClick={onDismiss} aria-label="Dismiss" className="rounded-md p-1 hover:bg-danger/10">
            <X size={14} aria-hidden />
          </button>
        </div>
      )}
    </div>
  )
}
