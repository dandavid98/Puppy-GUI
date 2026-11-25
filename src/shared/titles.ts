/** Conversation titles: the instant fallback and the model-written one. Pure, so testable. */

const MAX_TITLE = 60
const MAX_CONTEXT = 1200

function clip(title: string): string {
  return title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE - 3).trimEnd()}...` : title
}

/** What a first message is about, for naming: its text, or what was attached when there is none. */
export function titleSource(text: string, attachments: { name: string }[] = []): string {
  return text.trim() || attachments.map((file) => file.name).join(', ')
}

/** Instant fallback: the first line of the first message. */
export function titleFrom(text: string): string {
  return clip(text.trim().split('\n')[0].trim())
}

export function titlePrompt(firstMessage: string): string {
  return [
    'Write a short title (3 to 6 words) for a conversation that starts with the message below.',
    'Reply with the title only: no quotes, no trailing punctuation, no tools, no explanation.',
    '',
    '<message>',
    firstMessage.slice(0, MAX_CONTEXT),
    '</message>',
  ].join('\n')
}

/** Models love to add "Title:", quotes and full stops. Strip all of it. */
export function cleanTitle(reply: string): string | null {
  const firstLine = reply.trim().split('\n').find((line) => line.trim()) ?? ''
  const title = firstLine
    .replace(/^\s*(\*\*)?title(\*\*)?\s*:\s*/i, '')
    .replace(/^[\s"'`*#]+|[\s"'`*.!]+$/g, '')
    .trim()
  if (!title) return null
  return clip(title)
}
