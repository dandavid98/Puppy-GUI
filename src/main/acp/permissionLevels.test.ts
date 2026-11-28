import { describe, expect, it } from 'vitest'
import { confirmedLevel, PermissionLevels } from './permissionLevels'

describe('PermissionLevels', () => {
  it('treats a chat nobody set as standard, and remembers each chat on its own', () => {
    const levels = new PermissionLevels()
    expect(levels.get('new')).toBe('standard')
    levels.set('a', 'ask')
    levels.set('b', 'full')
    expect([levels.get('a'), levels.get('b'), levels.get('c')]).toEqual(['ask', 'full', 'standard'])
    levels.forget('a')
    expect(levels.get('a')).toBe('standard')
  })
})

describe('confirmedLevel', () => {
  it('reads the level Code Puppy says it applied', () => {
    expect(confirmedLevel({ _meta: { puppy: { permission: 'full' } } })).toBe('full')
    expect(confirmedLevel({ _meta: { other: 1, puppy: { permission: 'ask' } } })).toBe('ask')
  })

  it('says nothing for a Code Puppy that accepted the mode and ignored it', () => {
    for (const answer of [{}, null, undefined, 'ok', { _meta: null }, { _meta: {} }, { _meta: { puppy: {} } }, { _meta: { puppy: { permission: 'max' } } }]) {
      expect(confirmedLevel(answer)).toBeNull()
    }
  })
})
