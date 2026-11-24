import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AvailableCommand } from '@agentclientprotocol/sdk'
import type { Attachment, PermissionPrompt } from '@shared/api'
import type { Thread } from '../state/store'
import { Composer } from './Composer'
import { Message, Thinking } from './Messages'
import { PermissionCard } from './PermissionCard'

interface Props {
  thread: Thread
  permissions: PermissionPrompt[]
  modelPicker: ReactNode
  contextMeter: ReactNode
  commands: AvailableCommand[]
  onSend: (text: string, attachments: Attachment[]) => void
  onStop: () => void
  onChooseFolder: () => void
  onAnswer: (requestId: string, optionId: string | null) => void
}

const STICK_THRESHOLD = 120

export function ThreadView({ thread, permissions, modelPicker, contextMeter, commands, onSend, onStop, onChooseFolder, onAnswer }: Props) {
  const [draft, setDraft] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const last = thread.items.at(-1)
  const showThinking = thread.running && last?.type !== 'assistant' && last?.type !== 'thought'

  // Follow the stream, unless the user has scrolled up to read.
  useEffect(() => {
    const element = scroller.current
    if (element && stickToBottom.current) element.scrollTop = element.scrollHeight
  }, [thread.items, permissions.length, showThinking])

  useEffect(() => {
    stickToBottom.current = true
    setDraft('')
  }, [thread.sessionId])

  const onScroll = () => {
    const element = scroller.current
    if (element) stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_THRESHOLD
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        <div role="log" aria-label="Conversation" className="mx-auto w-full max-w-3xl space-y-5 px-6 pt-4 pb-8">
          {thread.items.map((item) => (
            <Message key={item.id} item={item} />
          ))}
          {permissions.map((prompt) => (
            <PermissionCard key={prompt.requestId} prompt={prompt} onAnswer={onAnswer} />
          ))}
          {showThinking && permissions.length === 0 && <Thinking />}
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl px-6 pb-5">
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={onSend}
          commands={commands}
          onStop={onStop}
          running={thread.running}
          autoFocus
          placeholder="Reply to Code Puppy..."
          folder={thread.kind === 'code' ? { path: thread.cwd, onChoose: onChooseFolder } : undefined}
          modelPicker={modelPicker}
          contextMeter={contextMeter}
        />
        <p className="mt-2 text-center text-xs text-muted">Code Puppy can make mistakes. Check important changes.</p>
      </div>
    </div>
  )
}
