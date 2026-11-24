import { describe, expect, it } from 'vitest'
import {
  classify,
  encodingAttempts,
  fitWithin,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_EDGE,
  MAX_TEXT_BYTES,
  needsShrinking,
  SEND_IMAGE_BYTES,
  shrinkNote,
  withExtensionFor,
} from './attachments'

const MB = 1024 * 1024

describe('classify', () => {
  it('accepts images well past the old 5 MB limit, because big ones are shrunk before sending', () => {
    expect(classify('shot.png', 'image/png', 1000)).toEqual({ kind: 'image' })
    expect(classify('retina.png', 'image/png', 12 * MB)).toEqual({ kind: 'image' })
    expect(classify('edge.png', 'image/png', MAX_IMAGE_BYTES)).toEqual({ kind: 'image' })
  })

  it('still refuses absurdly large images, in plain words', () => {
    expect(classify('huge.jpg', 'image/jpeg', MAX_IMAGE_BYTES + 1)).toEqual({ error: 'huge.jpg is over 30 MB.' })
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

describe('needsShrinking', () => {
  it('leaves images that already fit alone, byte for byte', () => {
    expect(needsShrinking({ type: 'image/png', size: 1000 })).toBe(false)
    expect(needsShrinking({ type: 'image/png', size: SEND_IMAGE_BYTES })).toBe(false)
  })

  it('shrinks images over the send limit, up to the most we accept', () => {
    expect(needsShrinking({ type: 'image/png', size: SEND_IMAGE_BYTES + 1 })).toBe(true)
    expect(needsShrinking({ type: 'image/jpeg', size: MAX_IMAGE_BYTES })).toBe(true)
    expect(needsShrinking({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).toBe(false) // refused outright instead
  })

  it('never applies to text', () => {
    expect(needsShrinking({ type: 'text/plain', size: 10 * MB })).toBe(false)
  })

  it('keeps the send limit safely under the 5 MB the model allows, even after base64 adds a third', () => {
    expect(SEND_IMAGE_BYTES * (4 / 3)).toBeLessThan(5 * MB)
  })
})

describe('fitWithin', () => {
  it('scales the longer side down, keeping the shape', () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 })
    expect(fitWithin(3000, 6000, 2000)).toEqual({ width: 1000, height: 2000 })
  })

  it('never enlarges, and never collapses to nothing', () => {
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(10_000, 1, 100)).toEqual({ width: 100, height: 1 })
  })
})

describe('encodingAttempts', () => {
  it('tries lossless PNG first for screenshots and diagrams, then JPEG getting smaller', () => {
    const attempts = encodingAttempts('image/png')
    expect(attempts[0]).toEqual({ maxEdge: MAX_IMAGE_EDGE, type: 'image/png' })
    const jpegs = attempts.filter((attempt) => attempt.type === 'image/jpeg')
    expect(jpegs.length).toBeGreaterThan(2)
    for (let i = 1; i < jpegs.length; i++) {
      const [before, after] = [jpegs[i - 1], jpegs[i]]
      expect(after.maxEdge <= before.maxEdge && after.quality! <= before.quality!).toBe(true) // each step is no bigger than the last
    }
  })

  it('goes straight to JPEG for a JPEG (re-encoding it as PNG would only make it bigger)', () => {
    expect(encodingAttempts('image/jpeg').every((attempt) => attempt.type === 'image/jpeg')).toBe(true)
  })

  it('always has a last resort small enough to succeed on anything reasonable', () => {
    const last = encodingAttempts('image/png').at(-1)!
    expect(last.maxEdge).toBeLessThanOrEqual(768)
  })
})

describe('naming and wording', () => {
  it('renames to match the new format, so the name never lies', () => {
    expect(withExtensionFor('shot.png', 'image/jpeg')).toBe('shot.jpg')
    expect(withExtensionFor('Screen Shot 2026.11.24.png', 'image/jpeg')).toBe('Screen Shot 2026.11.24.jpg')
    expect(withExtensionFor('photo.webp', 'image/png')).toBe('photo.png')
    expect(withExtensionFor('pasted', 'image/jpeg')).toBe('pasted.jpg')
  })

  it('tells the user what happened', () => {
    expect(shrinkNote('shot.png', 12.34 * MB, 1.8 * MB)).toBe('shot.png was shrunk to fit (12.3 MB to 1.8 MB).')
  })
})
