import { useEffect, useId, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import type { AvailableCommand } from '@agentclientprotocol/sdk'
import { ArrowUp, FolderOpen, Paperclip, Square } from 'lucide-react'
import type { Attachment } from '@shared/api'
import { needsShrinking, readAttachment } from '../lib/attachments'
import { matchCommands } from '../lib/commands'
import { folderName, prettyPath } from '../lib/format'
import { previewOf } from '../state/thread'
import { AttachmentChips } from './AttachmentChips'
import { CHIP, CHIP_ICON } from './ui/chip'
import { commandOptionId, SlashMenu } from './SlashMenu'

interface Props {
  value: string
  onChange: (value: string) => void
  onSend: (text: string, attachments: Attachment[]) => void
  onStop?: () => void
  running?: boolean
  placeholder: string
  commands: AvailableCommand[]
  /** Code mode only: the project folder chip. */
  folder?: { path: string | null; onChoose: () => void }
  /** The chips under the box: folder and permissions on the left, context and model on the right. */
  permissionPicker?: ReactNode
  modelPicker?: ReactNode
  contextMeter?: ReactNode
  autoFocus?: boolean
}

const MAX_HEIGHT = 320
const ICON_BUTTON = 'grid size-8 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink'

export function Composer(props: Props) {
  const { value, onChange, onSend, onStop, running, placeholder, commands, folder, permissionPicker, modelPicker, contextMeter, autoFocus } = props
  const textarea = useRef<HTMLTextAreaElement>(null)
  const filePicker = useRef<HTMLInputElement>(null)
  const listId = useId()
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  /** Good news about a file (it was shrunk), or "working on it" while that happens. */
  const [fileNote, setFileNote] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [activeCommand, setActiveCommand] = useState(0)
  const [menuDismissed, setMenuDismissed] = useState(false)

  const suggestions = menuDismissed ? [] : matchCommands(value, commands)
  const menuOpen = suggestions.length > 0
  const canSend = (value.trim().length > 0 || attachments.length > 0) && !running

  // Grow with the content, up to a cap, like every good chat box.
  useEffect(() => {
    const element = textarea.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT)}px`
  }, [value])

  useEffect(() => {
    const box = textarea.current
    if (!autoFocus || !box) return
    box.focus()
    box.setSelectionRange(box.value.length, box.value.length) // after any text already there, e.g. "Use the QA agent to "
  }, [autoFocus])

  useEffect(() => {
    setActiveCommand(0)
    setMenuDismissed(false)
  }, [value])

  const addFiles = async (files: File[]) => {
    setFileError(null)
    setFileNote(files.some(needsShrinking) ? 'Preparing your image...' : null)
    const results = await Promise.allSettled(files.map(readAttachment))
    const read = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
    const failed = results.flatMap((result) => (result.status === 'rejected' ? [String(result.reason?.message ?? result.reason)] : []))
    setAttachments((current) => [...current, ...read.map(({ attachment }) => attachment)])
    setFileNote(read.flatMap(({ note }) => (note ? [note] : [])).join(' ') || null)
    if (failed.length) setFileError(failed.join(' '))
  }

  const submit = () => {
    if (!canSend) return
    onSend(value.trim(), attachments)
    onChange('')
    setAttachments([])
    setFileError(null)
    setFileNote(null)
  }

  const pickCommand = (command: AvailableCommand) => {
    onChange(`/${command.name} `)
    textarea.current?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        setActiveCommand((index) => (index + step + suggestions.length) % suggestions.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        pickCommand(suggestions[activeCommand])
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setMenuDismissed(true)
        return
      }
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...event.clipboardData.files]
    if (files.length) {
      event.preventDefault()
      void addFiles(files)
    }
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    void addFiles([...event.dataTransfer.files])
  }

  return (
    <div className="relative">
      {menuOpen && <SlashMenu id={listId} commands={suggestions} active={activeCommand} onHover={setActiveCommand} onPick={pickCommand} />}
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-2xl border bg-surface shadow-[0_2px_12px_rgba(0,0,0,0.05)] focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/20 ${dragging ? 'border-accent border-dashed ring-2 ring-accent/20' : 'border-line'}`}
      >
        {attachments.length > 0 && (
          <div className="px-3 pt-3">
            <AttachmentChips files={attachments.map(previewOf)} onRemove={(index) => setAttachments((list) => list.filter((_, i) => i !== index))} />
          </div>
        )}
        <label className="sr-only" htmlFor="composer">
          Message Code Puppy
        </label>
        <textarea
          id="composer"
          ref={textarea}
          rows={1}
          value={value}
          placeholder={dragging ? 'Drop files to attach' : placeholder}
          role="combobox"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={menuOpen ? commandOptionId(listId, activeCommand) : undefined}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          className="block max-h-80 w-full resize-none bg-transparent px-4 pt-4 pb-2 text-[15px] leading-6 placeholder:text-muted focus:outline-none"
        />
        {fileError && (
          <p role="alert" className="px-4 pb-1 text-xs text-danger">
            {fileError}
          </p>
        )}
        {fileNote && (
          <p role="status" className="px-4 pb-1 text-xs text-muted">
            {fileNote}
          </p>
        )}
        {/* Inside the box: only what acts on the message. Everything about the chat is in the chips below. */}
        <div className="flex items-center justify-between px-2.5 pb-2.5">
          <input
            ref={filePicker}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              void addFiles([...(event.target.files ?? [])])
              event.target.value = ''
            }}
          />
          <button type="button" onClick={() => filePicker.current?.click()} aria-label="Attach files" title="Attach files" className={`${ICON_BUTTON} shrink-0`}>
            <Paperclip size={17} aria-hidden />
          </button>
          {running && onStop ? (
            <button type="button" onClick={onStop} aria-label="Stop" className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink text-canvas hover:opacity-85">
              <Square size={12} fill="currentColor" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              aria-label="Send message"
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-on-accent hover:opacity-90 disabled:opacity-40"
            >
              <ArrowUp size={17} aria-hidden />
            </button>
          )}
        </div>
      </div>
      {/* Small, and they wrap rather than squeeze when the composer is narrow (beside the preview panel). */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1">
        {folder && (
          <button
            type="button"
            onClick={folder.onChoose}
            title={folder.path ? `Project folder: ${prettyPath(folder.path)}` : 'Choose a project folder'}
            aria-label={folder.path ? `Project folder: ${folderName(folder.path)}` : 'Choose folder'}
            className={`${CHIP} max-w-56`}
          >
            <FolderOpen size={CHIP_ICON} aria-hidden className="shrink-0" />
            <span className="truncate">{folder.path ? folderName(folder.path) : 'Choose folder'}</span>
          </button>
        )}
        {permissionPicker}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {contextMeter}
          {modelPicker}
        </div>
      </div>
    </div>
  )
}
