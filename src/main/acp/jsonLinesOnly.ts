/**
 * Code Puppy's theme plugin writes terminal colour escape codes (OSC
 * sequences, no trailing newline) to stdout at boot. The first JSON-RPC
 * message then lands glued onto the end of that junk, and a strict NDJSON
 * parser drops it, so `initialize` never gets a reply.
 *
 * This transform re-frames the byte stream into lines and keeps only the
 * JSON part of each one: everything before the first `{` is discarded, and
 * lines with no `{` at all are dropped entirely.
 */
export function jsonLinesOnly(): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let pending = ''

  const emitLine = (line: string, controller: TransformStreamDefaultController<Uint8Array>) => {
    const start = line.indexOf('{')
    if (start !== -1) controller.enqueue(encoder.encode(line.slice(start) + '\n'))
  }

  return new TransformStream({
    transform(chunk, controller) {
      pending += decoder.decode(chunk, { stream: true })
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) emitLine(line, controller)
    },
    flush(controller) {
      pending += decoder.decode()
      if (pending) emitLine(pending, controller)
    },
  })
}
