import { describe, expect, it } from 'vitest'
import { homeDraftId, readDraft, writeDraft, type DraftStorage } from './drafts'

const memory = (): DraftStorage & { size: () => number } => {
  const items = new Map<string, string>()
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
    size: () => items.size,
  }
}

describe('drafts', () => {
  it('keeps each chat its own unsent text, exactly as typed', () => {
    const storage = memory()
    writeDraft(storage, 's1', 'Rename the helper\n  and its tests ')
    writeDraft(storage, 's2', 'Something else')
    expect(readDraft(storage, 's1')).toBe('Rename the helper\n  and its tests ')
    expect(readDraft(storage, 's2')).toBe('Something else')
    expect(readDraft(storage, 'never typed in')).toBe('')
  })

  it('keeps nothing once the box is empty (sent, or cleared)', () => {
    const storage = memory()
    writeDraft(storage, 's1', 'Hello')
    writeDraft(storage, 's1', '')
    writeDraft(storage, 's2', '   \n')
    expect(readDraft(storage, 's1')).toBe('')
    expect(storage.size()).toBe(0)
  })

  it('gives the home screen one box per mode', () => {
    expect(homeDraftId('chat')).not.toBe(homeDraftId('code'))
  })

  it('still lets the user type when storage refuses (full or unavailable)', () => {
    const full: DraftStorage = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError') }, removeItem: () => undefined }
    expect(() => writeDraft(full, 's1', 'Hello')).not.toThrow()
  })
})
