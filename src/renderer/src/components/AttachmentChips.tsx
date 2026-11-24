import { FileText, X } from 'lucide-react'
import type { AttachmentPreview } from '../state/thread'

interface Props {
  files: AttachmentPreview[]
  onRemove?: (index: number) => void
  align?: 'start' | 'end'
}

/** Thumbnails for images, chips for text files. Removable while composing. */
export function AttachmentChips({ files, onRemove, align = 'start' }: Props) {
  if (!files.length) return null
  return (
    <ul aria-label="Attachments" className={`flex flex-wrap gap-2 ${align === 'end' ? 'justify-end' : ''}`}>
      {files.map((file, index) => (
        <li key={`${file.name}-${index}`} className="group relative">
          {file.kind === 'image' && file.src ? (
            <img src={file.src} alt={file.name} className="size-16 rounded-lg border border-line object-cover" />
          ) : (
            <span className="inline-flex h-16 max-w-52 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm">
              <FileText size={18} aria-hidden className="shrink-0 text-muted" />
              <span className="truncate">{file.name}</span>
            </span>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(index)}
              aria-label={`Remove ${file.name}`}
              className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-ink text-canvas opacity-0 group-hover:opacity-100 focus:opacity-100"
            >
              <X size={12} aria-hidden />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
