import { execFile, spawn } from 'node:child_process'
import { join } from 'node:path'
import type { UpdateOutcome } from '@shared/api'
import { readJson } from './jsonFile'

/** Written into the installed app's package.json by scripts/make-app.sh. */
export interface BuildInfo {
  /** The folder the app was built from. */
  puppySource?: string
  /** The commit it was built at. */
  puppyCommit?: string
}

export type Git = (args: string[], cwd: string) => Promise<string>

export const git: Git = (args, cwd) =>
  new Promise((done, fail) => {
    execFile('git', args, { cwd, timeout: 30_000 }, (error, stdout) => (error ? fail(error) : done(stdout.trim())))
  })

export interface UpdateCheck {
  /** Commits on the remote that this copy of the source does not have yet (what a `git pull` would bring). */
  behind: number
  /** The source has moved on since this app was built, so a repackage alone would change it. */
  rebuild: boolean
  /** GitHub could not be reached, so `behind` may be out of date. */
  offline: boolean
}

export const isAvailable = (check: UpdateCheck): boolean => check.behind > 0 || check.rebuild

/** Ask git what is new. Never throws: no network just means "judge by the local source". */
export async function checkForUpdate(source: string, builtCommit: string | undefined, run: Git = git): Promise<UpdateCheck> {
  const offline = await run(['fetch', '--quiet'], source).then(() => false, () => true)
  // No upstream branch is not an error worth reporting: there is just nothing to pull.
  const behind = await run(['rev-list', '--count', 'HEAD..@{u}'], source).then((count) => Number(count) || 0, () => 0)
  const head = await run(['rev-parse', 'HEAD'], source).catch(() => undefined)
  return { behind, rebuild: head !== undefined && head !== builtCommit, offline }
}

export function describeUpdate({ behind, rebuild }: UpdateCheck): string {
  const parts: string[] = []
  if (behind > 0) parts.push(`${behind} new change${behind === 1 ? '' : 's'} on GitHub, which will be pulled`)
  if (rebuild && behind === 0) parts.push('Your source code is newer than the installed app')
  return `${parts.join('. ')}.\n\nPuppy will close, update itself and reopen. That takes about a minute.`
}

interface Deps {
  /** Folder holding the installed app's package.json (app.getAppPath()). */
  appPath: string
  /** Updating means replacing ~/Applications/Puppy.app, so it only makes sense when that is what is running. */
  packaged: boolean
  dataPath: string
  pid: number
  confirm: (message: string) => Promise<boolean>
  quit: () => void
  run?: Git
  /** Starts the hand-off script; separate so tests never launch one. */
  launch?: (script: string, args: string[], cwd: string) => void
}

const launchDetached = (script: string, args: string[], cwd: string) =>
  spawn('bash', [script, ...args], { cwd, detached: true, stdio: 'ignore' }).unref()

type Located = { source: string; commit: string | undefined } | { reason: string }

/** Where the installed app's code lives and which commit it was built at, or why we cannot tell. */
function locate(appPath: string, packaged: boolean): Located {
  if (!packaged) return { reason: 'You are running Puppy from source. Updating is for the installed Puppy.app.' }
  const { puppySource: source, puppyCommit: commit } = readJson<BuildInfo>(join(appPath, 'package.json'), {})
  if (!source) return { reason: 'This copy of Puppy does not know where its code is. Run `npm run package:mac` once from the source folder, then try again.' }
  return { source, commit }
}

/** Is there something to update to? Quietly false when updating is not possible at all (e.g. running from source). */
export async function updateAvailable({ appPath, packaged, run = git }: Pick<Deps, 'appPath' | 'packaged' | 'run'>): Promise<boolean> {
  const found = locate(appPath, packaged)
  return 'reason' in found ? false : isAvailable(await checkForUpdate(found.source, found.commit, run))
}

/**
 * "Update Puppy": pull what is new (if anything), reinstall dependencies if they
 * changed, repackage, and reopen. The work is done by scripts/update-app.sh,
 * detached, because an app cannot replace itself while it is running.
 */
export async function updatePuppy({ appPath, packaged, dataPath, pid, confirm, quit, run = git, launch = launchDetached }: Deps): Promise<UpdateOutcome> {
  const found = locate(appPath, packaged)
  if ('reason' in found) return { state: 'unavailable', reason: found.reason }
  const { source, commit: puppyCommit } = found

  const check = await checkForUpdate(source, puppyCommit, run)
  if (!isAvailable(check)) {
    return check.offline
      ? { state: 'unavailable', reason: "Could not reach GitHub to look for updates. Are you on the VPN? (Nothing new in your local code.)" }
      : { state: 'current' }
  }
  if (!(await confirm(describeUpdate(check)))) return { state: 'declined' }

  launch(join(source, 'scripts', 'update-app.sh'), [String(pid), join(dataPath, 'update.log'), check.behind > 0 ? 'pull' : 'rebuild'], source)
  quit()
  return { state: 'started' }
}
