import type { ToolCallContent, ToolKind } from '@agentclientprotocol/sdk'
import {
  Brain, Check, ChevronRight, CircleX, Eye, FileText, Globe, LoaderCircle, MoveRight, Pencil, Search, Terminal, Trash, Wrench,
  type LucideIcon,
} from 'lucide-react'
import { previewablePaths } from '../lib/previewable'
import { compactDiff } from '../state/diff'
import { usePreviewActions } from './previewContext'
import type { ToolCallView } from '../state/thread'

const ICONS: Record<ToolKind, LucideIcon> = {
  read: FileText,
  edit: Pencil,
  delete: Trash,
  move: MoveRight,
  search: Search,
  execute: Terminal,
  think: Brain,
  fetch: Globe,
  switch_mode: Wrench,
  other: Wrench,
}

const MAX_OUTPUT = 6000

function clip(text: string): string {
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n... (${text.length - MAX_OUTPUT} more characters)` : text
}

function asText(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

/** Show a shell command as a command, anything else as pretty JSON. */
function inputText(rawInput: unknown): string | null {
  if (rawInput && typeof rawInput === 'object' && 'command' in rawInput) return `$ ${String(rawInput.command)}`
  return asText(rawInput)
}

function StatusIcon({ status }: { status: ToolCallView['status'] }) {
  if (status === 'completed') return <Check size={14} className="text-muted" aria-label="Done" />
  if (status === 'failed') return <CircleX size={14} className="text-danger" aria-label="Failed" />
  return <LoaderCircle size={14} className="animate-spin text-muted" aria-label="Running" />
}

function Block({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">{label}</div>
      <pre className="selectable max-h-72 overflow-auto rounded-lg bg-canvas p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
        {clip(text)}
      </pre>
    </div>
  )
}

function DiffBlock({ content }: { content: Extract<ToolCallContent, { type: 'diff' }> }) {
  const styles = { added: 'bg-added', removed: 'bg-removed', context: '' } as const
  const signs = { added: '+', removed: '-', context: ' ' } as const
  return (
    <div>
      <div className="mb-1 truncate font-mono text-xs text-muted">{content.path}</div>
      <pre className="selectable max-h-80 overflow-auto rounded-lg bg-canvas py-2 font-mono text-xs leading-relaxed">
        {compactDiff(content.oldText, content.newText).map((line, index) => (
          <div key={index} className={`px-3 ${styles[line.type]}`}>
            <span aria-hidden className="mr-2 text-muted select-none">{signs[line.type]}</span>
            {line.text || ' '}
          </div>
        ))}
      </pre>
    </div>
  )
}

export function ToolCallCard({ call }: { call: ToolCallView }) {
  const { cwd, showFile } = usePreviewActions()
  const previews = call.status === 'completed' && cwd ? previewablePaths(call, cwd) : []
  const Icon = ICONS[call.kind ?? 'other'] ?? Wrench
  const input = inputText(call.rawInput)
  const output = asText(call.rawOutput)
  const diffs = call.content.filter((c): c is Extract<ToolCallContent, { type: 'diff' }> => c.type === 'diff')
  const texts = call.content.flatMap((c) => (c.type === 'content' && c.content.type === 'text' ? [c.content.text] : []))
  const hasDetails = Boolean(input || output || diffs.length || texts.length)

  return (
    <div className="my-1">
    <details className="group rounded-xl border border-line bg-surface/60 open:bg-surface">
      <summary
        className={`flex list-none items-center gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden ${hasDetails ? 'cursor-pointer' : 'pointer-events-none'}`}
      >
        <Icon size={15} aria-hidden className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate">{call.title}</span>
        <StatusIcon status={call.status} />
        {hasDetails && <ChevronRight size={14} aria-hidden className="text-muted transition-transform group-open:rotate-90" />}
      </summary>
      {hasDetails && (
        <div className="space-y-3 border-t border-line px-3 py-3">
          {input && <Block label="Input" text={input} />}
          {diffs.map((diff) => <DiffBlock key={diff.path} content={diff} />)}
          {texts.map((text, index) => <Block key={index} label="Result" text={text} />)}
          {output && !diffs.length && <Block label="Output" text={output} />}
        </div>
      )}
    </details>
    {previews.map((path) => (
      <button
        key={path}
        type="button"
        onClick={() => showFile(path)}
        className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-sm hover:bg-raised"
      >
        <Eye size={14} aria-hidden />
        Preview {path.split('/').pop()}
      </button>
    ))}
    </div>
  )
}
