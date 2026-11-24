import { localUrlsIn, previewTarget, type PreviewTarget } from '@shared/preview'
import { previewablePaths } from '../lib/previewable'
import type { ThreadItem, ToolCallView } from './thread'

/** What the agent just did that is worth showing without being asked. */
export interface AutoPreview {
  /** A page or image it wrote: show it right away. */
  file?: PreviewTarget
  /** Local servers it mentioned: shown once they actually answer. */
  urls: string[]
}

// Colourised dev-server output ("Local: \x1b[36mhttp://localhost:\x1b[1m5173\x1b[22m/"),
// either raw or JSON-escaped, would otherwise split the URL.
const ANSI = /(?:\u001b|\\u001b)\[[0-9;]*m/g

const asText = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value ?? ''))

/** Local URLs a shell command printed, minus any that were merely part of the command (curl, tests...). */
function serverUrlsPrinted(call: ToolCallView): string[] {
  const command = asText((call.rawInput as { command?: unknown } | null | undefined)?.command)
  const typed = new Set(localUrlsIn(command))
  return localUrlsIn(asText(call.rawOutput).replace(ANSI, '')).filter((url) => !typed.has(url))
}

/**
 * Writing or editing a page/image shows it; running a command that prints a
 * local address queues that server. Reading a file never counts: that is
 * looking, not making (the Preview button is still there for it).
 */
export function previewForCompletedCall(call: ToolCallView, cwd: string): AutoPreview {
  if (call.kind === 'edit') {
    const [path] = previewablePaths(call, cwd)
    return { file: path ? previewTarget(path) : undefined, urls: [] }
  }
  return { urls: call.kind === 'execute' ? serverUrlsPrinted(call) : [] }
}

/** The assistant's words since the user last spoke. */
export function latestReply(items: ThreadItem[]): string {
  const lastUser = items.findLastIndex((item) => item.type === 'user')
  return items
    .slice(lastUser + 1)
    .flatMap((item) => (item.type === 'assistant' ? [item.text] : []))
    .join('\n')
}

export function previewForReply(items: ThreadItem[]): AutoPreview {
  return { urls: localUrlsIn(latestReply(items)) }
}
