import { mkdirSync, mkdtempSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_LIMITS, findTokenFiles } from './envFiles'

function makeHome() {
  const home = mkdtempSync(join(tmpdir(), 'puppy-home-'))
  const put = (path: string, text: string, modified?: Date) => {
    const file = join(home, path)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, text)
    if (modified) utimesSync(file, modified, modified)
    return file
  }
  return { home, put }
}

describe('findTokenFiles', () => {
  it('finds token files deep in a person\'s folders, described in plain words, newest first', async () => {
    const { home, put } = makeHome()
    const older = put('Desktop/work/DAG/scan-matcher/.env.local', 'PW_TOKEN=abc\nPW_EMAIL=me@walmart.com\n', new Date('2026-11-20'))
    const newer = put('Documents/reports/.env', 'API_KEY=xyz\n', new Date('2026-11-26'))
    const found = await findTokenFiles(home)
    expect(found.map((item) => item.file)).toEqual([newer, older])
    expect(found[1]).toMatchObject({ name: '.env.local', folder: 'scan-matcher', where: '~/Desktop/work/DAG/scan-matcher' })
    expect(found[1].modifiedMs).toBe(new Date('2026-11-20').getTime())
  })

  it('ignores templates, files with no token line or an empty one, and everything that is not an env file', async () => {
    const { home, put } = makeHome()
    put('p/.env.example', 'API_KEY=changeme\n')
    put('p/.env.sample', 'API_KEY=changeme\n')
    put('p/.env.local.bak', 'API_KEY=an-old-copy\n')
    put('p/.env.old', 'API_KEY=an-old-copy\n')
    put('q/.env', 'PORT=3000\nHOST=localhost\n')
    put('r/.env', 'API_KEY=\n')
    put('s/Q3 sales.xlsx', 'API_KEY=not-an-env-file')
    put('s/notes.env.txt', 'API_KEY=x')
    expect(await findTokenFiles(home)).toEqual([])
  })

  it('does not wander into places that are not the person\'s work', async () => {
    const { home, put } = makeHome()
    put('Library/Application Support/thing/.env', 'API_KEY=x\n')
    put('project/node_modules/pkg/.env', 'API_KEY=x\n')
    put('project/.git/.env', 'API_KEY=x\n')
    put('project/venv/.env', 'API_KEY=x\n')
    put('project/.env', 'API_KEY=real\n')
    const found = await findTokenFiles(home)
    expect(found.map((item) => item.where)).toEqual(['~/project'])
  })

  it('does not follow links (a link back up must not loop it)', async () => {
    const { home, put } = makeHome()
    put('project/.env', 'API_KEY=real\n')
    symlinkSync(home, join(home, 'project', 'loop'))
    expect(await findTokenFiles(home)).toHaveLength(1)
  })

  it('gives up politely at its limits, and caps the list', async () => {
    const { home, put } = makeHome()
    put('a/b/c/.env', 'API_KEY=deep\n')
    expect(await findTokenFiles(home, { ...DEFAULT_LIMITS, depth: 2 })).toEqual([]) // too deep for that limit
    for (let index = 0; index < 5; index++) put(`many/p${index}/.env`, 'API_KEY=x\n')
    expect(await findTokenFiles(home, { ...DEFAULT_LIMITS, results: 3 })).toHaveLength(3)
    expect(await findTokenFiles(home, { ...DEFAULT_LIMITS, entries: 1 })).toEqual([])
  })

  it('returns nothing, not an error, when the home folder cannot be read', async () => {
    expect(await findTokenFiles('/no/such/home')).toEqual([])
  })

  it('never carries anything from inside a file', async () => {
    const { home, put } = makeHome()
    put('p/.env', 'API_KEY=super-secret-value-123\n')
    expect(JSON.stringify(await findTokenFiles(home))).not.toContain('super-secret-value-123')
  })
})
