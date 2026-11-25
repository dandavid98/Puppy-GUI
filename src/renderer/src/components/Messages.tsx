import { Brain, ChevronRight, CircleX, PawPrint } from 'lucide-react'
import type { AttachmentPreview, ThreadItem } from '../state/thread'
import { AttachmentChips } from './AttachmentChips'
import { CopyButton, Markdown } from './Markdown'
import { ToolCallCard } from './ToolCallCard'

function UserMessage({ text, attachments = [] }: { text: string; attachments?: AttachmentPreview[] }) {
  return (
    <div className="flex flex-col items-end gap-2">
      <AttachmentChips files={attachments} align="end" />
      {text && (
        <div className="selectable max-w-[85%] rounded-2xl bg-raised px-4 py-2.5 text-[15px] leading-6 whitespace-pre-wrap">
          {text}
        </div>
      )}
    </div>
  )
}

function AssistantMessage({ text }: { text: string }) {
  return (
    <div className="group">
      <Markdown text={text} />
      <div className="mt-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <CopyButton text={text} />
      </div>
    </div>
  )
}

function Thought({ text, open }: { text: string; open: boolean }) {
  return (
    <details open={open} className="group text-sm text-muted">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md py-1 hover:text-ink [&::-webkit-details-marker]:hidden">
        <Brain size={14} aria-hidden />
        Thought process
        <ChevronRight size={14} aria-hidden className="transition-transform group-open:rotate-90" />
      </summary>
      <div className="selectable mt-1 border-l-2 border-line pl-3 leading-6 whitespace-pre-wrap">{text}</div>
    </details>
  )
}

function ErrorMessage({ text }: { text: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
      <CircleX size={16} aria-hidden className="mt-0.5 shrink-0" />
      <span className="selectable">{text}</span>
    </div>
  )
}

/** Shown while a turn runs and nothing is streaming yet. */
export function Thinking() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted" role="status">
      <PawPrint size={16} aria-hidden className="animate-pulse text-accent" />
      <span>Sniffing around...</span>
    </div>
  )
}

export function Message({ item, showWork = false }: { item: ThreadItem; /** Thinking mode: thoughts and tool calls start open. */ showWork?: boolean }) {
  switch (item.type) {
    case 'user':
      return <UserMessage text={item.text} attachments={item.attachments} />
    case 'assistant':
      return <AssistantMessage text={item.text} />
    case 'thought':
      return <Thought text={item.text} open={showWork} />
    case 'error':
      return <ErrorMessage text={item.text} />
    case 'tool':
      return <ToolCallCard call={item.call} open={showWork} />
  }
}
