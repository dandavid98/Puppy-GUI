import { isPreviewable } from '@shared/preview'
import type { ToolCallView } from '../state/thread'

const absolute = (path: string, cwd: string) => (path.startsWith('/') ? path : `${cwd.replace(/\/$/, '')}/${path}`)

/**
 * Files a tool call produced or touched that the preview panel can show.
 * Looks at the diff paths, reported locations and the usual file_path argument,
 * and resolves relative paths against the session's folder.
 */
export function previewablePaths(call: ToolCallView, cwd: string): string[] {
  const rawInput = call.rawInput as { file_path?: unknown } | null | undefined
  const candidates = [
    ...call.content.flatMap((item) => (item.type === 'diff' ? [item.path] : [])),
    ...(call.locations ?? []).map((location) => location.path),
    ...(typeof rawInput?.file_path === 'string' ? [rawInput.file_path] : []),
  ]
  return [...new Set(candidates.filter(isPreviewable).map((path) => absolute(path, cwd)))]
}
