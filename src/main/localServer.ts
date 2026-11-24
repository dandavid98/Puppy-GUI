import { connect } from 'node:net'
import { setTimeout as sleep } from 'node:timers/promises'

export function canConnect(host: string, port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((done) => {
    const socket = connect({ host, port, timeout: timeoutMs })
    const finish = (up: boolean) => {
      socket.destroy()
      done(up)
    }
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

interface WaitOptions {
  timeoutMs?: number
  intervalMs?: number
  probe?: (host: string, port: number) => Promise<boolean>
}

/**
 * Dev servers take a moment to start, and the agent often mentions the address
 * before the server is listening. Poll until it answers so the preview panel
 * never opens on a connection error. Resolves false if it never comes up.
 */
export async function waitForServer(url: string, { timeoutMs = 20_000, intervalMs = 400, probe = canConnect }: WaitOptions = {}): Promise<boolean> {
  const { hostname, port } = new URL(url)
  const host = hostname.replace(/^\[|\]$/g, '')
  const deadline = Date.now() + timeoutMs
  do {
    if (await probe(host, Number(port) || 80)) return true
    await sleep(intervalMs)
  } while (Date.now() < deadline)
  return false
}

/**
 * Many dev servers (Django by default) refuse to be shown inside a frame, which
 * would leave the preview panel blank. These are the user's own local servers,
 * so drop the two headers that forbid framing: X-Frame-Options, and the
 * frame-ancestors directive of Content-Security-Policy.
 */
export function withoutFramingBlocks(headers: Record<string, string[]>): Record<string, string[]> {
  const kept: Record<string, string[]> = {}
  for (const [name, values] of Object.entries(headers)) {
    const lower = name.toLowerCase()
    if (lower === 'x-frame-options') continue
    if (lower === 'content-security-policy') {
      const cleaned = values.map((value) => value.split(';').filter((directive) => !/^\s*frame-ancestors\b/i.test(directive)).join(';')).filter((value) => value.trim())
      if (cleaned.length) kept[name] = cleaned
      continue
    }
    kept[name] = values
  }
  return kept
}
