import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { AvailableCommand } from '@agentclientprotocol/sdk'
import type { Attachment, PermissionPrompt } from '@shared/api'
import type { Thread } from '../state/store'
import { Composer } from './Composer'
import { Message, Thinking } from './Messages'
import { PermissionCard } from './PermissionCard'

interface Props {
  thread: Thread
  /** Thinking mode: show Code Puppy's work opened up, as the terminal does. */
  showWork: boolean
  permissions: PermissionPrompt[]
  permissionPicker: ReactNode
  modelPicker: ReactNode
  contextMeter: ReactNode
  commands: AvailableCommand[]
  onSend: (text: string, attachments: Attachment[]) => void
  onStop: () => void
  onChooseFolder: () => void
  onAnswer: (requestId: string, optionId: string | null) => void
}

const STICK_THRESHOLD = 120

export function ThreadView({ thread, showWork, permissions, permissionPicker, modelPicker, contextMeter, commands, onSend, onStop, onChooseFolder, onAnswer }: Props) {
  const [draft, setDraft] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const last = thread.items.at(-1)
  const showThinking = thread.running && last?.type !== 'assistant' && last?.type !== 'thought'

  // A conversation starts at its latest message (this component is remounted per conversation, see App), then
  // follows the stream unless the user has scrolled up to read. A saved history replays faster than scroll events
  // arrive, so while it loads we always follow, and once it is loaded we land on the end for certain.
  const toBottom = () => {
    const element = scroller.current
    if (element) element.scrollTop = element.scrollHeight
  }
  useLayoutEffect(() => {
    if (thread.replaying) stickToBottom.current = true
    if (stickToBottom.current) toBottom()
  }, [thread.items, thread.replaying, permissions.length, showThinking])
  useLayoutEffect(() => {
    if (thread.replaying) return
    stickToBottom.current = true
    toBottom()
  }, [thread.replaying])

  const onScroll = () => {
    const element = scroller.current
    if (element) stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_THRESHOLD
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        <div role="log" aria-label="Conversation" className="mx-auto w-full max-w-3xl space-y-5 px-6 pt-4 pb-8">
          {thread.items.map((item) => (
            <Message key={item.id} item={item} showWork={showWork} />
          ))}
          {permissions.map((prompt) => (
            <PermissionCard key={prompt.requestId} prompt={prompt} onAnswer={onAnswer} />
          ))}
          {showThinking && permissions.length === 0 && <Thinking />}
        </div>
      </div>
      <div className="mx-auto w-full max-w-4xl px-6 pb-5">
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
          permissionPicker={permissionPicker}
          modelPicker={modelPicker}
          contextMeter={contextMeter}
        />
        <p className="mt-2 text-center text-xs text-muted">Code Puppy can make mistakes. Check important changes.</p>
      </div>
    </div>
  )
}
