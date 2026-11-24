import { describe, expect, it } from 'vitest'
import { isInside } from './pathGuard'

describe('isInside', () => {
  const roots = ['/work/app', '/data/previews']

  it('allows files within an allowed folder', () => {
    expect(isInside('/work/app/report.html', roots)).toBe(true)
    expect(isInside('/data/previews/a/b.html', roots)).toBe(true)
  })

  it('blocks ../ escapes and sibling folders sharing a prefix', () => {
    expect(isInside('/work/app/../secrets/key.txt', roots)).toBe(false)
    expect(isInside('/work/app-evil/x.html', roots)).toBe(false)
    expect(isInside('/etc/passwd', roots)).toBe(false)
  })

  it('allows nothing when there are no roots', () => {
    expect(isInside('/work/app/x.html', [])).toBe(false)
  })
})
