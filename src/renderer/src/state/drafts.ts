import { useCallback, useState } from 'react'
import type { WorkspaceKind } from '@shared/api'

/** Where unsent text is kept: the window's localStorage in the app (it survives restarts), a fake in tests. */
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const PREFIX = 'puppy.draft.'

/** The box on the home screen, before its chat exists: one per mode. */
export const homeDraftId = (mode: WorkspaceKind) => `new:${mode}`

export function readDraft(storage: DraftStorage, id: string): string {
  return storage.getItem(PREFIX + id) ?? ''
}

/** Keeps the text exactly as typed; an empty (or blank) box keeps nothing. */
export function writeDraft(storage: DraftStorage, id: string, text: string): void {
  try {
    if (text.trim()) storage.setItem(PREFIX + id, text)
    else storage.removeItem(PREFIX + id)
  } catch {
    /* storage full or unavailable: the box still works, the text just is not kept */
  }
}

/**
 * A chat box's text that outlives the box: switch chats, open Settings, or restart Puppy, and it
 * is still there until it is sent. `initial` (an "Ask for this agent" prompt) replaces what was kept.
 */
export function useDraft(id: string, initial?: string): [string, (text: string) => void] {
  const [text, setText] = useState(() => {
    if (initial === undefined) return readDraft(localStorage, id)
    writeDraft(localStorage, id, initial)
    return initial
  })
  const update = useCallback(
    (next: string) => {
      setText(next)
      writeDraft(localStorage, id, next)
    },
    [id],
  )
  return [text, update]
}

/** A deleted chat's unsent text goes with it. */
export const forgetDraft = (id: string) => writeDraft(localStorage, id, '')
