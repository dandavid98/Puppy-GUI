import { useState } from 'react'
import { ExternalLink, RotateCw, X } from 'lucide-react'
import type { PreviewTarget } from '@shared/preview'

interface Props {
  target: PreviewTarget
  /** Changes whenever the same target is shown again (e.g. a file was edited), forcing a fresh load. */
  revision: number
  onClose: () => void
  onOpenExternal: () => void
}

/**
 * Files get the strictest sandbox: without allow-same-origin a generated page
 * can run its scripts (charts!) but cannot reach the app or any file.
 * Local servers are the user's own apps and need their own origin to work
 * (cookies, storage, fetching their own API). That is safe because their origin
 * is never the app's (the app refuses to preview its own), and subframes get
 * no preload bridge to window.puppy.
 */
const SANDBOX = {
  file: 'allow-scripts allow-forms allow-popups',
  web: 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals',
} as const

const HEADER_BUTTON = 'rounded-md p-1.5 text-muted hover:bg-raised hover:text-ink'

export function PreviewPanel({ target, revision, onClose, onOpenExternal }: Props) {
  const [reloads, setReloads] = useState(0)
  return (
    <aside aria-label="Preview" className="flex w-[46%] min-w-80 shrink-0 flex-col border-l border-line bg-surface">
      <header className="drag flex h-12 shrink-0 items-center gap-1 border-b border-line pr-2 pl-4">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium" title={target.location}>
          {target.title}
        </h2>
        <button type="button" onClick={() => setReloads((count) => count + 1)} aria-label="Reload preview" title="Reload" className={HEADER_BUTTON}>
          <RotateCw size={15} aria-hidden />
        </button>
        <button type="button" onClick={onOpenExternal} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-raised hover:text-ink">
          <ExternalLink size={14} aria-hidden />
          Open in browser
        </button>
        <button type="button" onClick={onClose} aria-label="Close preview" className={HEADER_BUTTON}>
          <X size={16} aria-hidden />
        </button>
      </header>
      {/* White backdrop: generated pages assume a light background. */}
      <iframe
        key={`${target.url}#${revision}.${reloads}`}
        title={`Preview of ${target.title}`}
        src={target.url}
        sandbox={SANDBOX[target.kind]}
        className="min-h-0 flex-1 bg-white"
      />
    </aside>
  )
}
