import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

const BINARY = 'code-puppy'

/**
 * Find the `code-puppy` executable.
 *
 * Apps launched from Finder get a minimal PATH, so the standard installer
 * location is checked before PATH. `PUPPY_DESKTOP_BIN` overrides both.
 */
export function locateCodePuppy(env: NodeJS.ProcessEnv = process.env): string {
  const candidates = [
    env.PUPPY_DESKTOP_BIN,
    join(homedir(), '.code-puppy-venv', 'bin', BINARY),
    ...(env.PATH ?? '').split(delimiter).filter(Boolean).map((dir) => join(dir, BINARY)),
  ].filter((path): path is string => Boolean(path))

  const found = candidates.find((path) => existsSync(path))
  if (!found) {
    throw new Error('Could not find code-puppy. Install Code Puppy (or set PUPPY_DESKTOP_BIN to its path) and restart the app.')
  }
  return found
}
