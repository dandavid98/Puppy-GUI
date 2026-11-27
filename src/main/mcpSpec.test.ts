import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { allowedUrl, fill, mentions, npmRegistry, packageMirrors, parseSpec, toAcpSpec, WALMART_NPM, type ServerSpec } from './mcpSpec'

const emptyHome = () => mkdtempSync(join(tmpdir(), 'puppy-home-'))

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

describe('fill and mentions', () => {
  it('fills both spellings Code Puppy writes, whole names only, and values are taken literally', () => {
    const values = { TOKEN: 'a$&b', db_path: '/data/x.db' }
    expect(fill('Bearer $TOKEN', values)).toBe('Bearer a$&b')
    expect(fill('Bearer ${TOKEN}', values)).toBe('Bearer a$&b')
    expect(fill('$TOKEN_TWO and ${db_path}', values)).toBe('$TOKEN_TWO and /data/x.db')
  })

  it('knows where a spec mentions a value', () => {
    const spec: ServerSpec = { type: 'stdio', command: 'npx', args: ['${db_path}'], env: { KEY: '$API_KEY' } }
    expect(['db_path', 'API_KEY', 'API'].map((name) => mentions(spec, name))).toEqual([true, true, false])
  })
})

describe('parseSpec', () => {
  it('accepts complete local and remote servers, and refuses incomplete or unsafe ones', () => {
    expect(parseSpec('stdio', { command: 'npx', args: ['-y', 5, 'x'], env: { PORT: 3000 } })).toEqual({ type: 'stdio', command: 'npx', args: ['-y', 'x'], env: { PORT: '3000' } })
    expect(parseSpec('http', { url: 'https://a.walmart.com/mcp' })).toEqual({ type: 'http', url: 'https://a.walmart.com/mcp', headers: {} })
    expect(parseSpec('stdio', { args: [] })).toBeNull()
    expect(parseSpec('sse', { url: 'http://evil.example.com' })).toBeNull()
    expect(parseSpec('websocket', { url: 'https://a.walmart.com' })).toBeNull()
  })
})

describe('toAcpSpec', () => {
  it('fills a local server, adds the mirrors, and passes values its template never mentions as environment variables', () => {
    const spec: ServerSpec = { type: 'stdio', command: 'npx', args: ['-y', 'pkg', '${db_path}'], env: { GH: '$GITHUB_TOKEN' } }
    expect(toAcpSpec(spec, 'gh', { db_path: '/x.db', GITHUB_TOKEN: 'k', EMAIL_PASS: 'p' }, { npm_config_registry: WALMART_NPM })).toEqual({
      name: 'gh',
      command: 'npx',
      args: ['-y', 'pkg', '/x.db'],
      env: [
        { name: 'npm_config_registry', value: WALMART_NPM },
        { name: 'EMAIL_PASS', value: 'p' },
        { name: 'GH', value: 'k' },
      ],
    })
  })

  it('fills a remote server\'s URL and headers', () => {
    const spec: ServerSpec = { type: 'http', url: 'https://mcp.context7.com/mcp', headers: { Authorization: 'Bearer $CONTEXT7_API_KEY' } }
    expect(toAcpSpec(spec, 'c7', { CONTEXT7_API_KEY: 'k' })).toEqual({ type: 'http', name: 'c7', url: 'https://mcp.context7.com/mcp', headers: [{ name: 'Authorization', value: 'Bearer k' }] })
  })
})

describe('package registries', () => {
  it("uses Walmart's mirrors when the user set up none", () => {
    const home = emptyHome()
    expect(packageMirrors({}, home)).toEqual({
      npm_config_registry: WALMART_NPM,
      UV_DEFAULT_INDEX: 'https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple',
      UV_INSECURE_HOST: 'pypi.ci.artifacts.walmart.com',
    })
    expect(npmRegistry({}, home)).toBe(WALMART_NPM)
  })

  it("does not mistake npm's own default (which npm exports to every script) for the user's choice", () => {
    const env = { npm_config_registry: 'https://registry.npmjs.org/' }
    expect(packageMirrors(env, emptyHome())).toHaveProperty('npm_config_registry', WALMART_NPM)
    expect(npmRegistry(env, emptyHome())).toBe(WALMART_NPM)
  })

  it("uses the user's own npm and uv setup, from config files or passed on from the environment (servers do not inherit it)", () => {
    const home = emptyHome()
    writeFileSync(join(home, '.npmrc'), 'fund=false\nregistry=https://npm.example.com/repo\n')
    mkdirSync(join(home, '.config', 'uv'), { recursive: true })
    writeFileSync(join(home, '.config', 'uv', 'uv.toml'), '[[index]]\nurl = "https://pypi.example.com/simple"\n')
    expect(packageMirrors({}, home)).toEqual({ npm_config_registry: 'https://npm.example.com/repo/' })
    expect(npmRegistry({}, home)).toBe('https://npm.example.com/repo/')
    expect(packageMirrors({ npm_config_registry: 'https://npm.mine/', UV_INDEX_URL: 'https://pypi.mine/simple' }, emptyHome())).toEqual({
      npm_config_registry: 'https://npm.mine/',
      UV_DEFAULT_INDEX: 'https://pypi.mine/simple',
    })
  })
})
