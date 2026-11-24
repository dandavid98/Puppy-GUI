import { describe, expect, it } from 'vitest'
import { classify, MAX_IMAGE_BYTES, MAX_TEXT_BYTES } from './attachments'

describe('classify', () => {
  it('accepts common images within the size limit', () => {
    expect(classify('shot.png', 'image/png', 1000)).toEqual({ kind: 'image' })
    expect(classify('big.jpg', 'image/jpeg', MAX_IMAGE_BYTES + 1)).toEqual({ error: 'big.jpg is over 5 MB.' })
  })

  it('accepts text and code by mime type or extension', () => {
    expect(classify('notes.txt', 'text/plain', 10)).toEqual({ kind: 'text' })
    expect(classify('app.tsx', '', 10)).toEqual({ kind: 'text' })
    expect(classify('data.json', 'application/json', 10)).toEqual({ kind: 'text' })
    expect(classify('huge.log', 'text/plain', MAX_TEXT_BYTES + 1)).toHaveProperty('error')
  })

  it('rejects binaries with a plain-language reason', () => {
    expect(classify('report.pdf', 'application/pdf', 10)).toEqual({
      error: "report.pdf can't be attached. Images and text or code files only.",
    })
  })
})
