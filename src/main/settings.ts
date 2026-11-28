import { execFileSync } from 'node:child_process'
import { THEMES, type ModelFallbackSettings, type Settings } from '@shared/api'
import { readJson, writeJsonAtomic } from './jsonFile'

const MAX_NAME = 40
/** Code Puppy agent names: "code-puppy", "qa-kitten", "my_agent.v2". */
const AGENT_NAME = /^[\w.-]{1,80}$/
/** Code Puppy model names: "claude-sonnet-5-5", "gpt-5.6-sol". */
const MODEL_NAME = /^[\w.:/@+-]{1,120}$/

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

/** The fallback pair, field by field: a patch may carry only what changed. */
function mergeFallback(current: ModelFallbackSettings, patch: unknown): ModelFallbackSettings {
  if (typeof patch !== 'object' || patch === null) return current
  const next = { ...current }
  const fields = patch as Record<string, unknown>
  if (typeof fields.enabled === 'boolean') next.enabled = fields.enabled
  for (const key of ['main', 'secondary'] as const) {
    const model = fields[key]
    if (model === null || (typeof model === 'string' && MODEL_NAME.test(model))) next[key] = model
  }
  return next
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
  if (patch.defaultAgent === null || (typeof patch.defaultAgent === 'string' && AGENT_NAME.test(patch.defaultAgent))) {
    next.defaultAgent = patch.defaultAgent as string | null
  }
  next.modelFallback = mergeFallback(current.modelFallback, patch.modelFallback)
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
      defaultAgent: null,
      modelFallback: { enabled: false, main: null, secondary: null }, // opt-in: it spends the other model's quota
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
