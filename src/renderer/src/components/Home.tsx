import { useState, type ReactNode } from 'react'
import type { AvailableCommand } from '@agentclientprotocol/sdk'
import { FolderOpen, PawPrint } from 'lucide-react'
import type { Attachment, WorkspaceKind } from '@shared/api'
import { folderName, greeting, prettyPath } from '../lib/format'
import { Composer } from './Composer'
import { Thinking } from './Messages'

interface Props {
  mode: WorkspaceKind
  name: string
  folder: string | null
  recentFolders: string[]
  modelPicker: ReactNode
  contextMeter: ReactNode
  commands: AvailableCommand[]
  onSend: (text: string, attachments: Attachment[]) => Promise<void>
  onChooseFolder: () => void
  onSelectFolder: (folder: string) => void
  /** Text the box starts with ("Ask for this agent"). Give Home a new `key` to apply a new one. */
  initialDraft?: string
}

const STARTERS = [
  'Explain a concept simply',
  'Draft a short email',
  'Summarize some text',
  'Brainstorm ideas',
]

/** The empty state: greeting, a big composer, and quick starts. */
export function Home({ mode, name, folder, recentFolders, modelPicker, contextMeter, commands, onSend, onChooseFolder, onSelectFolder, initialDraft = '' }: Props) {
  const [draft, setDraft] = useState(initialDraft)
  const [sending, setSending] = useState(false)
  const isCode = mode === 'code'

  // Home unmounts as soon as the new thread opens; this only covers the gap.
  const send = (text: string, attachments: Attachment[]) => {
    setSending(true)
    void onSend(text, attachments).finally(() => setSending(false))
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 pb-24">
      <div className="w-full max-w-2xl">
        <h1 className="mb-8 flex items-center justify-center gap-3 text-center font-serif text-4xl tracking-tight">
          <PawPrint size={34} aria-hidden className="text-accent" />
          {isCode ? 'What are we building?' : name ? `${greeting()}, ${name}` : greeting()}
        </h1>

        <Composer
          value={draft}
          onChange={setDraft}
          onSend={send}
          commands={commands}
          running={sending}
          autoFocus
          placeholder={isCode ? (folder ? `Ask about ${folderName(folder)} or describe a change...` : 'Choose a folder, then describe what you want...') : 'How can I help you today?'}
          folder={isCode ? { path: folder, onChoose: onChooseFolder } : undefined}
          modelPicker={modelPicker}
          contextMeter={contextMeter}
        />

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {sending ? (
            <Thinking />
          ) : isCode ? (
            recentFolders.map((path) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => onSelectFolder(path)}
                  title={prettyPath(path)}
                  aria-pressed={path === folder}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${path === folder ? 'border-accent/50 bg-accent-soft' : 'border-line text-muted hover:bg-raised hover:text-ink'}`}
                >
                  <FolderOpen size={14} aria-hidden />
                  {folderName(path)}
                </button>
              ))
          ) : (
            STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => setDraft(`${starter}: `)}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-raised hover:text-ink"
                >
                  {starter}
                </button>
              ))
          )}
        </div>
      </div>
    </div>
  )
}
