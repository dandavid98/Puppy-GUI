import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { acpSessionDir, deletePersistedSession, safeName } from './sessionStore'

describe('acpSessionDir', () => {
  it('follows code-puppy: XDG_CACHE_HOME if set, else ~/.code_puppy', () => {
    expect(acpSessionDir({})).toBe(join(homedir(), '.code_puppy', 'autosaves', 'acp'))
    expect(acpSessionDir({ XDG_CACHE_HOME: '/x/cache' })).toBe('/x/cache/code_puppy/autosaves/acp')
  })
})

describe('deletePersistedSession', () => {
  it('removes exactly the files code-puppy writes for that session', () => {
    const dir = mkdtempSync(join(tmpdir(), 'puppy-acp-'))
    for (const name of ['sess_a.json', 'sess_a_meta.json', 'sess_a_acp.json', 'sess_b.json']) {
      writeFileSync(join(dir, name), '{}')
    }
    deletePersistedSession('sess_a', dir)
    expect(readdirSync(dir)).toEqual(['sess_b.json'])
  })

  it('is a no-op for sessions that were never saved', () => {
    const dir = mkdtempSync(join(tmpdir(), 'puppy-acp-'))
    expect(() => deletePersistedSession('never', dir)).not.toThrow()
    expect(existsSync(dir)).toBe(true)
  })

  it('sanitises ids like code-puppy does', () => {
    expect(safeName('sess/../x y')).toBe('sess____x_y')
  })
})
