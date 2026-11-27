import { describe, expect, it } from 'vitest'
import { resolveRedirects, type Fetch } from './redirects'

const answering = (routes: Record<string, { status: number; location?: string }>): Fetch => async (url) => {
  const route = routes[url] ?? { status: 200 }
  return { status: route.status, headers: { get: () => route.location ?? null } }
}

describe('resolveRedirects', () => {
  it('follows a same-origin redirect (also a relative one), and leaves a URL that does not redirect alone', async () => {
    const fetcher = answering({ 'https://a.walmart.com/mcp': { status: 307, location: '/mcp/' } })
    expect(await resolveRedirects('https://a.walmart.com/mcp', fetcher)).toBe('https://a.walmart.com/mcp/')
    expect(await resolveRedirects('https://b.walmart.com/mcp', fetcher)).toBe('https://b.walmart.com/mcp')
  })

  it('never follows a redirect to another host, to plain http, or in a loop for ever', async () => {
    const away = answering({ 'https://a.walmart.com/mcp': { status: 302, location: 'https://evil.example.com/mcp' } })
    expect(await resolveRedirects('https://a.walmart.com/mcp', away)).toBe('https://a.walmart.com/mcp')
    const downgrade = answering({ 'https://a.walmart.com/mcp': { status: 302, location: 'http://a.walmart.com/mcp' } })
    expect(await resolveRedirects('https://a.walmart.com/mcp', downgrade)).toBe('https://a.walmart.com/mcp')
    const loop = answering({ 'https://a.walmart.com/x': { status: 307, location: '/y' }, 'https://a.walmart.com/y': { status: 307, location: '/x' } })
    expect(await resolveRedirects('https://a.walmart.com/x', loop)).toMatch(/^https:\/\/a\.walmart\.com\/[xy]$/)
  })

  it('keeps the URL when the server cannot be reached', async () => {
    const down: Fetch = async () => {
      throw new Error('ENOTFOUND')
    }
    expect(await resolveRedirects('https://a.walmart.com/mcp', down)).toBe('https://a.walmart.com/mcp')
  })
})
