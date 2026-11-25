import { execFileSync } from 'node:child_process'
import { THEMES, type Settings } from '@shared/api'
import { readJson, writeJsonAtomic } from './jsonFile'

const MAX_NAME = 40

/** First name from the macOS account ("Doe, Jane" and "Jane Doe" both give "Jane"). */
export function firstNameFrom(fullName: string): string {
  const name = fullName.includes(',') ? fullName.split(',')[1] : fullName
  return name.trim().split(/\s+/)[0] ?? ''
}

function accountFirstName(): string {
  try {
    return firstNameFrom(execFileSync('id', ['-F'], { encoding: 'utf8', timeout: 2000 }))
  } catch {
    return ''
  }
}

/** Merge untrusted input (IPC or a hand-edited file) field by field; junk is ignored. */
export function mergeSettings(current: Settings, patch: Partial<Record<keyof Settings, unknown>>): Settings {
  const next = { ...current }
  if (typeof patch.theme === 'string' && (THEMES as readonly string[]).includes(patch.theme)) {
    next.theme = patch.theme as Settings['theme']
  }
  if (typeof patch.displayName === 'string') next.displayName = patch.displayName.trim().slice(0, MAX_NAME)
  if (typeof patch.smartTitles === 'boolean') next.smartTitles = patch.smartTitles
  if (typeof patch.autoPreview === 'boolean') next.autoPreview = patch.autoPreview
  if (typeof patch.thinkingMode === 'boolean') next.thinkingMode = patch.thinkingMode
  return next
}

export class SettingsStore {
  private current: Settings

  constructor(private readonly path: string) {
    const defaults: Settings = {
      theme: 'system',
      displayName: accountFirstName(),
      smartTitles: true,
      autoPreview: true,
      thinkingMode: false, // opt-in: it is a lot to look at
    }
    this.current = mergeSettings(defaults, readJson(path, {}))
  }

  get(): Settings {
    return this.current
  }

  update(patch: Partial<Record<keyof Settings, unknown>>): Settings {
    this.current = mergeSettings(this.current, patch)
    writeJsonAtomic(this.path, this.current)
    return this.current
  }
}
