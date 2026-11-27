import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Marketplace, MarketplaceToken, McpServerConfig } from './mcpMarketplace'
import { allowedUrl, McpService, toAcpServers, toolPrefixes, type StoredMcpServer } from './mcpServers'

const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJleHAiOjk5OTk5OTk5OTl9.signature-part'

const config = (id: string, overrides: Partial<McpServerConfig> = {}): McpServerConfig => ({
  id,
  name: id,
  displayName: id.toUpperCase(),
  type: 'http',
  url: `https://${id}.walmart.com/mcp`,
  headers: { 'WM_SVC.NAME': id, Authorization: 'Bearer $PUPPY_MARKETPLACE_TOKEN' },
  ...overrides,
})

function fakeMarket(token: MarketplaceToken = { token: TOKEN, expiresAt: null }) {
  const calls = { token: 0, list: 0, signIn: 0 }
  const market: Marketplace = {
    list: async () => {
      calls.list++
      return [{ id: 'a', displayName: 'A', description: '', tags: [], author: '', verified: true }]
    },
    config: async (id) => (id === 'gone' ? null : config(id)),
    token: async () => {
      calls.token++
      return token
    },
    signIn: async () => {
      calls.signIn++
      return { token: TOKEN, expiresAt: null }
    },
  }
  return { market, calls }
}

const tempFile = () => join(mkdtempSync(join(tmpdir(), 'puppy-mcp-')), 'mcp-servers.json')

describe('toolPrefixes', () => {
  it('keeps short names, trims long ones, and never repeats one', () => {
    expect(toolPrefixes(['accelerator-mcp', 'SOF0001528 ActiveMQ MCP Server', 'sof0001528-activemq-other', ''])).toEqual([
      'accelerator-mcp',
      'sof0001528-activ',
      'sof0001528-acti2',
      'mcp',
    ])
  })

  it('stays model-safe: letters, digits, dash and underscore, at most 16 characters', () => {
    for (const prefix of toolPrefixes(['Weird!! name / with spaces and more and more', '日本語'])) {
      expect(prefix).toMatch(/^[a-z0-9_-]{1,16}$/)
    }
  })
})

describe('toAcpServers', () => {
  const stored = (id: string, enabled = true, overrides: Partial<McpServerConfig> = {}): StoredMcpServer => ({ ...config(id, overrides), enabled })

  it('fills the token in, in memory, for enabled servers only', () => {
    const servers = toAcpServers([stored('one'), stored('off', false)], TOKEN)
    expect(servers).toEqual([
      {
        type: 'http',
        name: 'one',
        url: 'https://one.walmart.com/mcp',
        headers: [
          { name: 'WM_SVC.NAME', value: 'one' },
          { name: 'Authorization', value: `Bearer ${TOKEN}` },
        ],
      },
    ])
  })

  it('leaves out servers that need a token when there is none, but keeps the ones that do not', () => {
    const open = stored('open', true, { headers: { 'X-Team': 'mine' } })
    expect(toAcpServers([stored('secured'), open], null).map((server) => server.name)).toEqual(['open'])
  })

  it('understands the ${...} spelling of the placeholder too', () => {
    const braces = stored('b', true, { headers: { Authorization: 'Bearer ${PUPPY_MARKETPLACE_TOKEN}' } })
    expect(toAcpServers([braces], 'abc')[0]).toMatchObject({ headers: [{ name: 'Authorization', value: 'Bearer abc' }] })
  })
})

describe('allowedUrl', () => {
  it('allows HTTPS anywhere and plain HTTP only on this Mac', () => {
    expect(allowedUrl('https://x.walmart.com/mcp')).toBe(true)
    expect(allowedUrl('http://127.0.0.1:8123/mcp')).toBe(true)
    expect(allowedUrl('http://localhost:3000')).toBe(true)
    expect(allowedUrl('http://evil.example.com/mcp')).toBe(false)
    expect(allowedUrl('file:///etc/passwd')).toBe(false)
    expect(allowedUrl('not a url')).toBe(false)
  })
})

describe('McpService', () => {
  it('adds servers to its own file, with the placeholder and never the token', async () => {
    const path = tempFile()
    const service = new McpService(path, fakeMarket().market)
    expect((await service.add('a')).servers).toEqual([{ id: 'a', displayName: 'A', enabled: true }])
    await service.sessionServers() // a token is now in memory
    const saved = readFileSync(path, 'utf8')
    expect(saved).toContain('$PUPPY_MARKETPLACE_TOKEN')
    expect(saved).not.toContain(TOKEN)
    expect(JSON.stringify(service.state)).not.toContain(TOKEN)
  })

  it('adds each server once, says so when the marketplace dropped it, and survives a restart', async () => {
    const path = tempFile()
    const service = new McpService(path, fakeMarket().market)
    await service.add('a')
    await service.add('a')
    await expect(service.add('gone')).rejects.toThrow(/no longer/)
    service.setEnabled('a', false)
    expect(new McpService(path, fakeMarket().market).state.servers).toEqual([{ id: 'a', displayName: 'A', enabled: false }])
    expect(service.remove('a').servers).toEqual([])
  })

  it('ignores junk and unsafe URLs in a hand-edited file', () => {
    const path = tempFile()
    writeFileSync(path, JSON.stringify([null, { id: 'x' }, { ...config('bad'), url: 'http://evil.example.com', enabled: true }, { ...config('ok'), enabled: true }]))
    expect(new McpService(path, fakeMarket().market).state.servers.map((server) => server.id)).toEqual(['ok'])
  })

  it('reads the token once and reuses it until it nears expiry', async () => {
    let now = 1_000_000_000_000
    const { market, calls } = fakeMarket({ token: TOKEN, expiresAt: now / 1000 + 3600 })
    const service = new McpService(tempFile(), market, () => now)
    await service.add('a')
    await service.sessionServers()
    await service.sessionServers()
    expect(calls.token).toBe(1)
    now += 3600_000 - 60_000 // a minute before expiry: too close to hand to a new chat
    await service.sessionServers()
    expect(calls.token).toBe(2)
  })

  it('does not read a token at all when nothing needs one', async () => {
    const { market, calls } = fakeMarket()
    const service = new McpService(tempFile(), market)
    expect(await service.sessionServers()).toEqual([])
    expect(calls.token).toBe(0)
  })

  it('never stops a chat from starting: a failing token read just leaves those servers out', async () => {
    const { market } = fakeMarket()
    const service = new McpService(tempFile(), { ...market, token: async () => Promise.reject(new Error('python gone')) })
    await service.add('a')
    expect(await service.sessionServers()).toEqual([])
  })

  it('tracks sign-in, and tells the window only when it changes', async () => {
    const service = new McpService(tempFile(), fakeMarket({ token: null, expiresAt: null }).market)
    const seen: (boolean | null)[] = []
    service.on('changed', (state) => seen.push(state.signedIn))
    await service.checkSignIn()
    await service.checkSignIn()
    await service.signIn()
    expect(seen).toEqual([false, true])
  })

  it('reads the marketplace once per run, but tries again after a failure', async () => {
    const { market, calls } = fakeMarket()
    let fail = true
    const flaky: Marketplace = { ...market, list: async () => (fail ? Promise.reject(new Error('off VPN')) : market.list()) }
    const service = new McpService(tempFile(), flaky)
    await expect(service.marketplace()).rejects.toThrow()
    fail = false
    await service.marketplace()
    await service.marketplace()
    expect(calls.list).toBe(1)
  })
})
