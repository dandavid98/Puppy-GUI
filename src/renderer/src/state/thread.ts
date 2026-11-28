import type { ContentBlock, SessionUpdate, ToolCall, ToolCallContent } from '@agentclientprotocol/sdk'
import type { Attachment } from '@shared/api'

export type ToolCallView = Pick<ToolCall, 'toolCallId' | 'title' | 'kind' | 'status' | 'rawInput' | 'rawOutput' | 'locations'> & {
  content: ToolCallContent[]
}

/** What a sent message shows of its attachments: a thumbnail or a file chip. */
export interface AttachmentPreview {
  name: string
  kind: Attachment['kind']
  src?: string
}

export type ThreadItem =
  | { type: 'user'; id: string; text: string; attachments?: AttachmentPreview[] }
  | { type: 'assistant' | 'thought' | 'error' | 'note'; id: string; text: string }
  | { type: 'tool'; id: string; call: ToolCallView }

type TextKind = 'user' | 'assistant' | 'thought'

const CHUNK_KINDS: Partial<Record<SessionUpdate['sessionUpdate'], TextKind>> = {
  user_message_chunk: 'user',
  agent_message_chunk: 'assistant',
  agent_thought_chunk: 'thought',
}

function appendText(items: ThreadItem[], type: TextKind, text: string): ThreadItem[] {
  const last = items.at(-1)
  if (last && last.type === type) {
    return [...items.slice(0, -1), { ...last, text: last.text + text }]
  }
  return [...items, { type, id: `${type}-${items.length}`, text }]
}

function upsertTool(items: ThreadItem[], patch: Partial<ToolCallView> & { toolCallId: string }): ThreadItem[] {
  const index = items.findIndex((item) => item.type === 'tool' && item.call.toolCallId === patch.toolCallId)
  if (index === -1) {
    const call: ToolCallView = { title: 'Working', content: [], ...stripNullish(patch), toolCallId: patch.toolCallId }
    return [...items, { type: 'tool', id: `tool-${patch.toolCallId}`, call }]
  }
  const existing = items[index] as Extract<ThreadItem, { type: 'tool' }>
  const updated = { ...existing, call: { ...existing.call, ...stripNullish(patch) } }
  return items.map((item, i) => (i === index ? updated : item))
}

/** ACP marks "not provided" as null/undefined; neither should wipe known values. */
function stripNullish<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>
}

/** Fold one `session/update` into the conversation. Unknown updates are ignored. */
export function applyUpdate(items: ThreadItem[], update: SessionUpdate): ThreadItem[] {
  const textKind = CHUNK_KINDS[update.sessionUpdate]
  if (textKind) {
    const content = (update as { content?: ContentBlock | null }).content
    return content?.type === 'text' ? appendText(items, textKind, content.text) : items
  }
  if (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') {
    const { sessionUpdate: _kind, ...patch } = update
    return upsertTool(items, patch as Partial<ToolCallView> & { toolCallId: string })
  }
  return items
}

export function previewOf(file: Attachment): AttachmentPreview {
  return file.kind === 'image'
    ? { name: file.name, kind: 'image', src: `data:${file.mimeType};base64,${file.data}` }
    : { name: file.name, kind: 'text' }
}

export function addUserMessage(items: ThreadItem[], text: string, attachments: Attachment[] = []): ThreadItem[] {
  const previews = attachments.length ? attachments.map(previewOf) : undefined
  return [...items, { type: 'user', id: `user-${items.length}`, text, attachments: previews }]
}

export function addError(items: ThreadItem[], text: string): ThreadItem[] {
  return [...items, { type: 'error', id: `error-${items.length}`, text }]
}

/** Something Puppy itself did that the user should know, as opposed to an error or something Code Puppy said. */
export function addNote(items: ThreadItem[], text: string): ThreadItem[] {
  return [...items, { type: 'note', id: `note-${items.length}`, text }]
}
