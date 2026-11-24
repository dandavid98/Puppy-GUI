import { describe, expect, it } from 'vitest'
import { ATTACHMENTS_ONLY, promptBlocks } from './promptBlocks'

describe('promptBlocks', () => {
  it('sends plain text as a single text block', () => {
    expect(promptBlocks('hi')).toEqual([{ type: 'text', text: 'hi' }])
  })

  it('puts attachments before the question in the right block types', () => {
    const blocks = promptBlocks('what is this?', [
      { kind: 'image', name: 'a.png', mimeType: 'image/png', data: 'AAAA' },
      { kind: 'text', name: 'my notes.md', mimeType: 'text/markdown', text: '# notes' },
    ])
    expect(blocks).toEqual([
      { type: 'image', data: 'AAAA', mimeType: 'image/png' },
      { type: 'resource', resource: { uri: 'file:///my%20notes.md', mimeType: 'text/markdown', text: '# notes' } },
      { type: 'text', text: 'what is this?' },
    ])
  })

  it('fills in a question when only files were sent', () => {
    const blocks = promptBlocks('  ', [{ kind: 'text', name: 'a.txt', mimeType: 'text/plain', text: 'x' }])
    expect(blocks.at(-1)).toEqual({ type: 'text', text: ATTACHMENTS_ONLY })
  })
})
