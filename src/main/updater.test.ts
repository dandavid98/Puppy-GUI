import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { checkForUpdate, describeUpdate, isAvailable, updateAvailable, updatePuppy, type Git } from './updater'

/** A fake git that answers by subcommand; a value of `Error` makes that command fail. */
function fakeGit(answers: { fetch?: string | Error; behind?: string | Error; head?: string | Error }): Git {
  return async (args) => {
    const answer = args[0] === 'fetch' ? answers.fetch : args[0] === 'rev-list' ? answers.behind : answers.head
    if (answer instanceof Error) throw answer
    return answer ?? ''
  }
}

describe('checkForUpdate', () => {
  it('counts what a pull would bring', async () => {
    const check = await checkForUpdate('/src', 'abc', fakeGit({ behind: '3', head: 'abc' }))
    expect(check).toEqual({ behind: 3, rebuild: false, offline: false })
  })

  it('notices local source that is newer than the installed app', async () => {
    expect(await checkForUpdate('/src', 'old', fakeGit({ behind: '0', head: 'new' }))).toMatchObject({ rebuild: true })
  })

  it('treats an app built before this feature (no commit recorded) as out of date', async () => {
    expect(await checkForUpdate('/src', undefined, fakeGit({ behind: '0', head: 'new' }))).toMatchObject({ rebuild: true })
  })

  it('says so when GitHub is unreachable, and still judges by the local source', async () => {
    const check = await checkForUpdate('/src', 'abc', fakeGit({ fetch: new Error('offline'), behind: '0', head: 'abc' }))
    expect(check).toEqual({ behind: 0, rebuild: false, offline: true })
  })

  it('copes with no upstream branch, and with a folder that is not a git repo', async () => {
    expect(await checkForUpdate('/src', 'abc', fakeGit({ behind: new Error('no upstream'), head: 'abc' }))).toMatchObject({ behind: 0 })
    const broken = new Error('not a repo')
    expect(await checkForUpdate('/src', 'abc', fakeGit({ fetch: broken, behind: broken, head: broken }))).toEqual({ behind: 0, rebuild: false, offline: true })
  })
})

describe('describeUpdate', () => {
  it('pluralises, and explains what will happen', () => {
    expect(describeUpdate({ behind: 1, rebuild: true, offline: false })).toContain('1 new change on GitHub')
    expect(describeUpdate({ behind: 2, rebuild: true, offline: false })).toContain('2 new changes on GitHub')
    expect(describeUpdate({ behind: 0, rebuild: true, offline: false })).toContain('newer than the installed app')
    expect(describeUpdate({ behind: 1, rebuild: false, offline: false })).toContain('reopen')
  })

  it('isAvailable: something to pull, or something to repackage', () => {
    expect(isAvailable({ behind: 0, rebuild: false, offline: false })).toBe(false)
    expect(isAvailable({ behind: 1, rebuild: false, offline: false })).toBe(true)
    expect(isAvailable({ behind: 0, rebuild: true, offline: false })).toBe(true)
  })
})

describe('updateAvailable (the sidebar badge)', () => {
  const appWith = (info: object) => {
    const appPath = mkdtempSync(join(tmpdir(), 'puppy-badge-'))
    writeFileSync(join(appPath, 'package.json'), JSON.stringify(info))
    return appPath
  }
  const built = { puppySource: '/src', puppyCommit: 'abc' }

  it('is true when GitHub has something new, or the source is ahead of the app', async () => {
    expect(await updateAvailable({ appPath: appWith(built), packaged: true, run: fakeGit({ behind: '1', head: 'abc' }) })).toBe(true)
    expect(await updateAvailable({ appPath: appWith(built), packaged: true, run: fakeGit({ behind: '0', head: 'newer' }) })).toBe(true)
  })

  it('is false when current', async () => {
    expect(await updateAvailable({ appPath: appWith(built), packaged: true, run: fakeGit({ behind: '0', head: 'abc' }) })).toBe(false)
  })

  it('is quietly false when updating is impossible: from source, or an app that does not know its code', async () => {
    expect(await updateAvailable({ appPath: appWith(built), packaged: false, run: fakeGit({ behind: '1', head: 'abc' }) })).toBe(false)
    expect(await updateAvailable({ appPath: appWith({}), packaged: true, run: fakeGit({ behind: '1', head: 'abc' }) })).toBe(false)
  })
})

describe('updatePuppy', () => {
  /** An "installed app" folder whose package.json records where it was built from. */
  const installed = (info: object) => {
    const appPath = mkdtempSync(join(tmpdir(), 'puppy-update-'))
    writeFileSync(join(appPath, 'package.json'), JSON.stringify(info))
    return appPath
  }
  const setup = (info: object, git: Git, { packaged = true, agree = true } = {}) => {
    const launch = vi.fn()
    const quit = vi.fn()
    const confirm = vi.fn(async () => agree)
    const run = () => updatePuppy({ appPath: installed(info), packaged, dataPath: '/data', pid: 42, confirm, quit, run: git, launch })
    return { launch, quit, confirm, run }
  }

  it('refuses to run from source: there is no installed app to replace', async () => {
    const { run, launch, quit } = setup({ puppySource: '/src' }, fakeGit({}), { packaged: false })
    expect(await run()).toMatchObject({ state: 'unavailable' })
    expect(launch).not.toHaveBeenCalled()
    expect(quit).not.toHaveBeenCalled()
  })

  it('explains itself when the app does not know where its code is', async () => {
    const { run, launch } = setup({}, fakeGit({}))
    expect(await run()).toMatchObject({ state: 'unavailable', reason: expect.stringContaining('package:mac') })
    expect(launch).not.toHaveBeenCalled()
  })

  it('does nothing when everything is current', async () => {
    const { run, confirm, launch } = setup({ puppySource: '/src', puppyCommit: 'abc' }, fakeGit({ behind: '0', head: 'abc' }))
    expect(await run()).toEqual({ state: 'current' })
    expect(confirm).not.toHaveBeenCalled()
    expect(launch).not.toHaveBeenCalled()
  })

  it('blames the network, not "up to date", when it could not look', async () => {
    const { run } = setup({ puppySource: '/src', puppyCommit: 'abc' }, fakeGit({ fetch: new Error('x'), behind: '0', head: 'abc' }))
    expect(await run()).toMatchObject({ state: 'unavailable', reason: expect.stringContaining('VPN') })
  })

  it('leaves everything alone when the user says not now', async () => {
    const { run, launch, quit } = setup({ puppySource: '/src', puppyCommit: 'abc' }, fakeGit({ behind: '2', head: 'abc' }), { agree: false })
    expect(await run()).toEqual({ state: 'declined' })
    expect(launch).not.toHaveBeenCalled()
    expect(quit).not.toHaveBeenCalled()
  })

  it('hands off to the update script with a pull, then quits', async () => {
    const { run, launch, quit } = setup({ puppySource: '/src', puppyCommit: 'abc' }, fakeGit({ behind: '2', head: 'abc' }))
    expect(await run()).toEqual({ state: 'started' })
    expect(launch).toHaveBeenCalledWith('/src/scripts/update-app.sh', ['42', '/data/update.log', 'pull'], '/src')
    expect(quit).toHaveBeenCalledOnce()
  })

  it('only rebuilds (no pull) when the code is already here', async () => {
    const { run, launch } = setup({ puppySource: '/src', puppyCommit: 'old' }, fakeGit({ behind: '0', head: 'new' }))
    await run()
    expect(launch.mock.calls[0][1][2]).toBe('rebuild')
  })
})
