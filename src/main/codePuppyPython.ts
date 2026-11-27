import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * Running small scripts inside code-puppy's own Python: quota, the agent catalog,
 * the MCP marketplace. Its modules already know the backend URLs, the user's token
 * and the corporate certificates, so Puppy never reads, stores or sends a credential.
 */

/** Our one line of output, found among whatever else the interpreter printed (importing code-puppy can emit escape codes). */
export const SENTINEL = 'PUPPY_JSON '

/**
 * What code-puppy's own entry point does before anything else: its setup doctor
 * fixes up the environment, most importantly pointing SSL_CERT_FILE at the
 * public + Walmart certificate bundle. An app launched from Finder has none of
 * that in its environment, and without it every HTTPS call to the backend fails
 * certificate checks (which code-puppy's helpers report as a quiet "None").
 * The doctor never raises and writes only to the stream we give it. It probes
 * the network (about 2.5s), so scripts that stay on this Mac skip it.
 */
const DOCTOR = `
try:
    from code_puppy.plugins.setup_doctor.runner import run_doctor
    run_doctor(stream=io.StringIO())
except Exception:
    pass
`

const EMIT = `
import io, json, sys
def emit(value):
    print("${SENTINEL}" + json.dumps(value, default=str))
`

export const PRELUDE = EMIT + DOCTOR

/** Find our JSON line and parse it; null when it is missing or garbled. Never throws. */
export function readSentinel(stdout: string): unknown {
  const line = stdout.split('\n').findLast((candidate) => candidate.startsWith(SENTINEL))
  if (!line) return null
  try {
    return JSON.parse(line.slice(SENTINEL.length))
  } catch {
    return null
  }
}

/** code-puppy's interpreter sits next to its launcher (…/bin/code-puppy and …/bin/python3). */
export function pythonNextTo(codePuppyBinary: string): string | null {
  const python = join(dirname(codePuppyBinary), 'python3')
  return existsSync(python) ? python : null
}

export type Runner = (python: string, args: string[], timeoutMs?: number) => Promise<string>

export const runPython: Runner = (python, args, timeoutMs = 30_000) =>
  new Promise((done, fail) => {
    execFile(python, args, { timeout: timeoutMs, maxBuffer: 20_000_000, cwd: homedir() }, (error, stdout) => (error ? fail(error) : done(stdout)))
  })

export interface ScriptOptions {
  args?: string[]
  /** False for scripts that never leave this Mac: skips the network doctor. */
  network?: boolean
  timeoutMs?: number
}

/** Run `body` (which reports through `emit(...)`) after the prelude; resolves to what it emitted, or null. */
export async function runScript(python: string, body: string, { args = [], network = true, timeoutMs }: ScriptOptions = {}, run: Runner = runPython): Promise<unknown> {
  const prelude = network ? PRELUDE : EMIT
  return readSentinel(await run(python, ['-c', prelude + body, ...args], timeoutMs))
}
