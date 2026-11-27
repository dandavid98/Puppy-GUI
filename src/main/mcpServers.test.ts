import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { McpServer } from '@agentclientprotocol/sdk'
import { describe, expect, it } from 'vitest'
import type { McpCatalogEntry } from '@shared/api'
import type { Catalog, CatalogTemplate } from './mcpCatalog'
import type { Marketplace, MarketplaceToken, McpServerConfig } from './mcpMarketplace'
import { completeValues, McpService, toAcpServers, toolPrefixes, type StoredMcpServer } from './mcpServers'
import { McpVault, type Cipher } from './mcpVault'

const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJleHAiOjk5OTk5OTk5OTl9.signature-part'
const KEY = 'ghp_super-secret-key-123'

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

const entry = (id: string, overrides: Partial<McpCatalogEntry> = {}): McpCatalogEntry => ({
  id,
  displayName: id.toUpperCase(),
  description: '',
  category: 'Development',
  tags: [],
  verified: true,
  fields: [],
  unavailable: null,
  deprecated: false,
  ...overrides,
})

const github: CatalogTemplate = {
  entry: entry('github', {
    fields: [
      { name: 'repo_dir', label: 'Repository folder', default: '/tmp', required: false, secret: false },
      { name: 'GITHUB_TOKEN', label: 'GITHUB_TOKEN', default: '', required: true, secret: true },
    ],
  }),
  name: 'github',
  spec: { type: 'stdio', command: 'npx', args: ['-y', 'server-github', '${repo_dir}'], env: { GITHUB_PERSONAL_ACCESS_TOKEN: '$GITHUB_TOKEN' } },
}
const files: CatalogTemplate = { entry: entry('filesystem'), name: 'filesystem', spec: { type: 'stdio', command: 'npx', args: ['-y', 'server-filesystem', '/tmp'], env: {} } }
const docker: CatalogTemplate = { entry: entry('docker', { unavailable: 'Needs docker' }), name: 'docker', spec: { type: 'stdio', command: 'npx', args: [], env: {} } }

function fakeCatalog(fail: string | null = null) {
  const checked: McpServer[] = []
  const catalog: Catalog = {
    list: async () => [github, files, docker],
    check: async (server) => {
      checked.push(server)
      if (fail) throw new Error(fail)
      return 3
    },
  }
  return { catalog, checked }
}

/** Reversible and obviously not plain text: enough to show nothing is written in the clear. */
const cipher: Cipher = {
  isEncryptionAvailable: () => true,
  encryptString: (plain) => Buffer.from([...plain].reverse().join('')),
  decryptString: (sealed) => [...sealed.toString()].reverse().join(''),
}

function setup({ market = fakeMarket().market, catalog = fakeCatalog().catalog, now = Date.now } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'puppy-mcp-'))
  const paths = { servers: join(dir, 'mcp-servers.json'), secrets: join(dir, 'mcp-secrets.json') }
  const make = () => new McpService(paths.servers, { market, catalog, vault: new McpVault(paths.secrets, cipher) }, now)
  return { service: make(), make, paths, onDisk: () => safeRead(paths.servers) + safeRead(paths.secrets) }
}

const safeRead = (path: string) => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

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
  const stored = (id: string, enabled = true, overrides: Partial<McpServerConfig> = {}): StoredMcpServer => {
    const { id: _id, ...spec } = config(id, overrides)
    const variables = JSON.stringify(spec.headers).includes('PUPPY_MARKETPLACE_TOKEN') ? ['PUPPY_MARKETPLACE_TOKEN'] : []
    return { ...spec, id, source: 'marketplace', enabled, variables }
  }
  const token = (value: string | null) => (): Record<string, string> => (value ? { PUPPY_MARKETPLACE_TOKEN: value } : {})

  it('fills the token in, in memory, for enabled servers only', () => {
    expect(toAcpServers([stored('one'), stored('off', false)], token(TOKEN))).toEqual([
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

  it('leaves out servers still missing a value, but keeps the ones that need none', () => {
    const open = stored('open', true, { headers: { 'X-Team': 'mine' } })
    expect(toAcpServers([stored('secured'), open], token(null)).map((server) => server.name)).toEqual(['open'])
  })
})

describe('completeValues', () => {
  it('trims, fills defaults, keeps only the entry\'s own fields, and names what is missing', () => {
    expect(completeValues(github.entry, { GITHUB_TOKEN: `  ${KEY} `, repo_dir: '', sneaky: 'x' })).toEqual({ repo_dir: '/tmp', GITHUB_TOKEN: KEY })
    expect(() => completeValues(github.entry, { GITHUB_TOKEN: '   ' })).toThrow('GITHUB_TOKEN is needed.')
  })
})

describe('McpService: marketplace', () => {
  it('adds servers to its own file, with the placeholder and never the token', async () => {
    const { service, onDisk } = setup()
    expect((await service.add('a')).servers).toEqual([{ id: 'a', displayName: 'A', enabled: true, source: 'marketplace' }])
    await service.sessionServers() // a token is now in memory
    expect(onDisk()).toContain('$PUPPY_MARKETPLACE_TOKEN')
    expect(onDisk()).not.toContain(TOKEN)
    expect(JSON.stringify(service.state)).not.toContain(TOKEN)
  })

  it('adds each server once, says so when the marketplace dropped it, and survives a restart', async () => {
    const { service, make } = setup()
    await service.add('a')
    await service.add('a')
    await expect(service.add('gone')).rejects.toThrow(/no longer/)
    service.setEnabled('a', false)
    expect(make().state.servers).toEqual([{ id: 'a', displayName: 'A', enabled: false, source: 'marketplace' }])
    expect(service.remove('a').servers).toEqual([])
  })

  it('reads files saved before catalog servers existed, and ignores junk and unsafe URLs', async () => {
    const { make, paths } = setup()
    const old = (id: string, url = `https://${id}.walmart.com/mcp`) => ({ ...config(id), url, enabled: true }) // no source, no variables
    writeFileSync(paths.servers, JSON.stringify([null, { id: 'x' }, old('bad', 'http://evil.example.com'), old('ok')]))
    const service = make()
    expect(service.state.servers).toEqual([{ id: 'ok', displayName: 'OK', enabled: true, source: 'marketplace' }])
    expect((await service.sessionServers())[0]).toMatchObject({ headers: [{}, { value: `Bearer ${TOKEN}` }] })
  })

  it('reads the token once and reuses it until it nears expiry', async () => {
    let now = 1_000_000_000_000
    const { market, calls } = fakeMarket({ token: TOKEN, expiresAt: now / 1000 + 3600 })
    const { service } = setup({ market, now: () => now })
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
    const { service } = setup({ market })
    await service.addFromCatalog('filesystem', {})
    expect(await service.sessionServers()).toHaveLength(1)
    expect(calls.token).toBe(0)
  })

  it('never stops a chat from starting: a failing token read just leaves those servers out', async () => {
    const { market } = fakeMarket()
    const { service } = setup({ market: { ...market, token: async () => Promise.reject(new Error('python gone')) } })
    await service.add('a')
    expect(await service.sessionServers()).toEqual([])
  })

  it('tracks sign-in, and tells the window only when it changes', async () => {
    const { service } = setup({ market: fakeMarket({ token: null, expiresAt: null }).market })
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
    const { service } = setup({ market: { ...market, list: async () => (fail ? Promise.reject(new Error('off VPN')) : market.list()) } })
    await expect(service.marketplace()).rejects.toThrow()
    fail = false
    await service.marketplace()
    await service.marketplace()
    expect(calls.list).toBe(1)
  })
})

describe('McpService: catalog', () => {
  it('starts the server once with the real values before adding it; saves placeholders, and the key only encrypted', async () => {
    const { catalog, checked } = fakeCatalog()
    const { service, onDisk } = setup({ catalog })
    const state = await service.addFromCatalog('github', { GITHUB_TOKEN: KEY })
    expect(state.servers).toEqual([{ id: 'catalog:github', displayName: 'GITHUB', enabled: true, source: 'catalog' }])
    expect(checked[0]).toMatchObject({ command: 'npx', args: ['-y', 'server-github', '/tmp'] })
    expect(checked[0]).toHaveProperty('env', expect.arrayContaining([{ name: 'GITHUB_PERSONAL_ACCESS_TOKEN', value: KEY }]))
    expect(onDisk()).toContain('$GITHUB_TOKEN')
    expect(onDisk()).not.toContain(KEY)
    expect(JSON.stringify(state)).not.toContain(KEY)
  })

  it('hands the key to new chats, read from the vault in memory, even after a restart', async () => {
    const { service, make } = setup()
    await service.addFromCatalog('github', { GITHUB_TOKEN: KEY })
    const [server] = await make().sessionServers()
    expect(server).toHaveProperty('env', expect.arrayContaining([{ name: 'GITHUB_PERSONAL_ACCESS_TOKEN', value: KEY }]))
  })

  it('does not add a server that fails to start, and says why', async () => {
    const { service, onDisk } = setup({ catalog: fakeCatalog('401 Bad credentials').catalog })
    await expect(service.addFromCatalog('github', { GITHUB_TOKEN: KEY })).rejects.toThrow('GITHUB did not start, so it was not added. 401 Bad credentials')
    expect(service.state.servers).toEqual([])
    expect(onDisk()).not.toContain(KEY)
  })

  it('refuses one that cannot run here, one no longer listed, and one missing a key, without starting anything', async () => {
    const { catalog, checked } = fakeCatalog()
    const { service } = setup({ catalog })
    await expect(service.addFromCatalog('docker', {})).rejects.toThrow('DOCKER: Needs docker.')
    await expect(service.addFromCatalog('nope', {})).rejects.toThrow(/no longer/)
    await expect(service.addFromCatalog('github', {})).rejects.toThrow('GITHUB_TOKEN is needed.')
    expect(checked).toEqual([])
  })

  it('forgets the key when the server is removed, and leaves out a server whose key can no longer be read', async () => {
    const { service, paths, make } = setup()
    await service.addFromCatalog('github', { GITHUB_TOKEN: KEY })
    writeFileSync(paths.secrets, JSON.stringify({ 'catalog:github': { GITHUB_TOKEN: '!!!' } }))
    const unreadable = new McpService(paths.servers, { market: fakeMarket().market, catalog: fakeCatalog().catalog, vault: new McpVault(paths.secrets, { ...cipher, decryptString: () => { throw new Error('Keychain reset') } }) })
    expect(await unreadable.sessionServers()).toEqual([])
    make().remove('catalog:github')
    expect(readFileSync(paths.secrets, 'utf8')).not.toContain('catalog:github')
  })
})
