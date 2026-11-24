import { homedir } from 'node:os'
import { join } from 'node:path'
import { readJson } from './jsonFile'

/** code-puppy's data folder: $XDG_DATA_HOME/code_puppy if set, else ~/.code_puppy (see its config.py). */
export function codePuppyDataDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.XDG_DATA_HOME ? join(env.XDG_DATA_HOME, 'code_puppy') : join(homedir(), '.code_puppy')
}

type ModelFile = Record<string, { context_length?: unknown } | null>

/**
 * Context window size per model name. code-puppy keeps models in models.json,
 * with extra_models.json layered on top; we read both the way it does.
 */
export function readContextLengths(dir: string = codePuppyDataDir()): Record<string, number> {
  const lengths: Record<string, number> = {}
  for (const file of ['models.json', 'extra_models.json']) {
    for (const [name, config] of Object.entries(readJson<ModelFile>(join(dir, file), {}))) {
      const length = Number(config?.context_length)
      if (Number.isFinite(length) && length > 0) lengths[name] = Math.round(length)
    }
  }
  return lengths
}
