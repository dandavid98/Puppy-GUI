import { useEffect, useState } from 'react'
import { FileKey } from 'lucide-react'
import type { ConnectionFileSuggestion } from '@shared/api'
import { formatAgo } from '@shared/connections'

interface Props {
  find: () => Promise<ConnectionFileSuggestion[]>
  selected: string
  onPick: (file: string) => void
}

/**
 * Token files Puppy found in the user's folders, in words rather than paths: the
 * project, the file, where it is and how recently it changed. Picking one beats
 * browsing a file dialog full of documents for a hidden file with a cryptic name.
 */
export function FileSuggestions({ find, selected, onPick }: Props) {
  const [found, setFound] = useState<ConnectionFileSuggestion[] | null>(null)

  useEffect(() => {
    let current = true
    find().then(
      (items) => current && setFound(items),
      () => current && setFound([]),
    )
    return () => {
      current = false
    }
  }, [find])

  return (
    <div>
      <p className="text-sm">Which file holds the token?</p>
      <p className="text-xs text-muted">Puppy looked through your folders for files that hold a token. Pick yours, or look for it below.</p>
      {!found ? (
        <p role="status" className="mt-2 text-sm text-muted">Looking for token files...</p>
      ) : found.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Puppy did not find one in your folders. Look for it below.</p>
      ) : (
        <ul aria-label="Token files Puppy found" className="mt-2 space-y-1.5">
          {found.map((item) => (
            <li key={item.file}>
              <button
                type="button"
                aria-pressed={selected === item.file}
                onClick={() => onPick(item.file)}
                className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left hover:bg-raised ${selected === item.file ? 'border-accent bg-raised' : 'border-line'}`}
              >
                <FileKey size={16} aria-hidden className="mt-0.5 shrink-0 text-muted" />
                <span className="min-w-0">
                  <span className="block text-sm">
                    <span className="font-medium">{item.folder}</span> <span className="text-muted">{item.name}</span>
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {item.where} · changed {formatAgo(Date.now() - item.modifiedMs)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
