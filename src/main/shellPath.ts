import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

const MARKER = 'PUPPY_SHELL_PATH='
/** Where node, npx and uvx usually live: used when the shell cannot be asked. */
const USUAL_DIRS = [join(homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin']

export type Run = (shell: string, args: string[]) => string

const askShell: Run = (shell, args) =>
  execFileSync(shell, args, {
    encoding: 'utf8',
    timeout: 3_000,
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { HOME: homedir(), USER: process.env.USER ?? '', LOGNAME: process.env.LOGNAME ?? '', SHELL: shell },
  })

const dedupe = (dirs: string[]) => [...new Set(dirs.filter(Boolean))].join(delimiter)

/**
 * The PATH a Terminal window would have, ahead of the current one.
 *
 * Apps opened from Finder get only /usr/bin:/bin:/usr/sbin:/sbin, without node,
 * npx or uvx: Code Puppy's shell commands and the MCP servers it starts could not
 * find them. A login shell reads the user's profile and reports the real PATH; if
 * it cannot be asked, the usual install locations stand in.
 */
export function loginShellPath(env: NodeJS.ProcessEnv = process.env, run: Run = askShell): string {
  const current = (env.PATH ?? '').split(delimiter)
  try {
    const output = run(env.SHELL || '/bin/zsh', ['-ilc', `printf '\\n${MARKER}%s\\n' "$PATH"`])
    const line = output.split('\n').findLast((candidate) => candidate.startsWith(MARKER))
    if (line) return dedupe([...line.slice(MARKER.length).split(delimiter), ...current])
  } catch {
    // a broken or slow profile: fall back below
  }
  return dedupe([...current, ...USUAL_DIRS])
}
