import type { ContentBlock } from '@agentclientprotocol/sdk'
import type { Attachment } from '@shared/api'

/** Used when the user sends only attachments: the agent still needs a question. */
export const ATTACHMENTS_ONLY = 'Please take a look at the attached files.'

/**
 * A message as ACP content blocks: attachments first (images as image blocks,
 * text files as embedded resources Code Puppy wraps in <context>), then the text.
 */
export function promptBlocks(text: string, attachments: Attachment[] = []): ContentBlock[] {
  const files = attachments.map((file): ContentBlock =>
    file.kind === 'image'
      ? { type: 'image', data: file.data, mimeType: file.mimeType }
      : { type: 'resource', resource: { uri: `file:///${encodeURIComponent(file.name)}`, mimeType: file.mimeType, text: file.text } },
  )
  const question = text.trim() || (attachments.length ? ATTACHMENTS_ONLY : '')
  return [...files, { type: 'text', text: question }]
}
