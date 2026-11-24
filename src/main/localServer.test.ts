import { createServer, type Server } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { waitForServer, withoutFramingBlocks } from './localServer'

describe('withoutFramingBlocks', () => {
  it('drops X-Frame-Options whatever its casing', () => {
    expect(withoutFramingBlocks({ 'X-Frame-Options': ['DENY'], 'Content-Type': ['text/html'] })).toEqual({ 'Content-Type': ['text/html'] })
    expect(withoutFramingBlocks({ 'x-frame-options': ['SAMEORIGIN'] })).toEqual({})
  })

  it('removes only the frame-ancestors part of a CSP', () => {
    const result = withoutFramingBlocks({ 'Content-Security-Policy': ["default-src 'self'; frame-ancestors 'none'; img-src *"] })
    expect(result['Content-Security-Policy']).toEqual(["default-src 'self'; img-src *"])
  })

  it('drops a CSP header that held nothing else', () => {
    expect(withoutFramingBlocks({ 'content-security-policy': ["frame-ancestors 'self'"] })).toEqual({})
  })

  it('leaves unrelated headers alone', () => {
    const headers = { 'Cache-Control': ['no-store'], 'Set-Cookie': ['a=1', 'b=2'] }
    expect(withoutFramingBlocks(headers)).toEqual(headers)
  })
})

describe('waitForServer', () => {
  let server: Server | undefined
  afterEach(() => server?.close())

  const listen = () =>
    new Promise<number>((done) => {
      server = createServer().listen(0, '127.0.0.1', () => done((server!.address() as { port: number }).port))
    })

  it('resolves true as soon as something is listening', async () => {
    const port = await listen()
    expect(await waitForServer(`http://localhost:${port}/`, { timeoutMs: 2_000 })).toBe(true)
  })

  it('waits for a server that is slow to start', async () => {
    let attempts = 0
    const probe = async () => ++attempts >= 3
    expect(await waitForServer('http://localhost:9999', { intervalMs: 5, timeoutMs: 2_000, probe })).toBe(true)
    expect(attempts).toBe(3)
  })

  it('gives up with false when nothing ever answers', async () => {
    expect(await waitForServer('http://localhost:9', { intervalMs: 5, timeoutMs: 50, probe: async () => false })).toBe(false)
  })
})
