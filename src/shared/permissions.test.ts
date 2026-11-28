import { describe, expect, it } from 'vitest'
import { allowOption, DEFAULT_PERMISSION_LEVEL, isPermissionLevel, PERMISSION_INFO, PERMISSION_LEVELS } from './permissions'

describe('permission levels', () => {
  it('start at standard, which is Code Puppy as it is', () => {
    expect(DEFAULT_PERMISSION_LEVEL).toBe('standard')
    expect(PERMISSION_LEVELS).toEqual(['ask', 'standard', 'full'])
  })

  it('describe every level in words, strictest first', () => {
    for (const level of PERMISSION_LEVELS) {
      expect(PERMISSION_INFO[level].label).not.toBe('')
      expect(PERMISSION_INFO[level].description).not.toBe('')
    }
  })

  it('only accept the three levels', () => {
    for (const level of PERMISSION_LEVELS) expect(isPermissionLevel(level)).toBe(true)
    for (const junk of ['max', 'Full', '', null, undefined, 3, {}]) expect(isPermissionLevel(junk)).toBe(false)
  })
})

describe('allowOption', () => {
  const option = (optionId: string, kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always') => ({ optionId, name: optionId, kind })

  it('picks the one-time yes, as Code Puppy offers it', () => {
    expect(allowOption([option('allow_once', 'allow_once'), option('reject_once', 'reject_once')])).toBe('allow_once')
  })

  it('prefers "once" to "always", and never picks a no', () => {
    expect(allowOption([option('a', 'allow_always'), option('o', 'allow_once')])).toBe('o')
    expect(allowOption([option('a', 'allow_always')])).toBe('a')
    expect(allowOption([option('r', 'reject_once'), option('x', 'reject_always')])).toBeNull()
    expect(allowOption([])).toBeNull()
  })
})
