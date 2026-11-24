import { mkdtempSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { codePuppyDataDir, readContextLengths } from './modelCatalog'

describe('readContextLengths', () => {
  it('reads models.json, lets extra_models.json override, and skips junk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'puppy-models-'))
    writeFileSync(join(dir, 'models.json'), JSON.stringify({ a: { context_length: 200000 }, b: { context_length: 'lots' }, c: null, d: {} }))
    writeFileSync(join(dir, 'extra_models.json'), JSON.stringify({ a: { context_length: 1000000 }, e: { context_length: 8000 } }))
    expect(readContextLengths(dir)).toEqual({ a: 1_000_000, e: 8_000 })
  })

  it('returns nothing (rather than throwing) when the files are missing', () => {
    expect(readContextLengths('/nonexistent')).toEqual({})
  })
})

describe('codePuppyDataDir', () => {
  it('follows code-puppy: XDG_DATA_HOME if set, else ~/.code_puppy', () => {
    expect(codePuppyDataDir({})).toBe(join(homedir(), '.code_puppy'))
    expect(codePuppyDataDir({ XDG_DATA_HOME: '/x/data' })).toBe('/x/data/code_puppy')
  })
})
