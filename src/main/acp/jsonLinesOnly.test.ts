import { describe, expect, it } from 'vitest'
import { jsonLinesOnly } from './jsonLinesOnly'

async function run(chunks: string[]): Promise<string[]> {
  const encoder = new TextEncoder()
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
      controller.close()
    },
  })
  const text = await new Response(source.pipeThrough(jsonLinesOnly())).text()
  return text.split('\n').filter(Boolean)
}

describe('jsonLinesOnly', () => {
  it('strips the OSC colour junk glued to the first message', async () => {
    const junk = '\x1b]11;#1a1b26\x07\x1b]4;15;#c0caf5\x07'
    expect(await run([`${junk}{"id":1}\n`])).toEqual(['{"id":1}'])
  })

  it('drops lines that contain no JSON at all', async () => {
    expect(await run(['warning: noise\n{"id":2}\n'])).toEqual(['{"id":2}'])
  })

  it('reassembles messages split across chunks', async () => {
    expect(await run(['{"id":', '3}\n{"id"', ':4}\n'])).toEqual(['{"id":3}', '{"id":4}'])
  })

  it('reassembles multi-byte characters split across chunks', async () => {
    const message = '{"t":"\u65e5\u672c"}\n' // two 3-byte CJK characters
    const bytes = new TextEncoder().encode(message)
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 7)) // splits the first character
        controller.enqueue(bytes.slice(7))
        controller.close()
      },
    })
    const text = await new Response(source.pipeThrough(jsonLinesOnly())).text()
    expect(text).toBe(message)
  })

  it('flushes a final line without a trailing newline', async () => {
    expect(await run(['{"id":5}'])).toEqual(['{"id":5}'])
  })
})
