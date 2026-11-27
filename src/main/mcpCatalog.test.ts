import { describe, expect, it } from 'vitest'
import { pythonNextTo, SENTINEL, type Runner } from './codePuppyPython'
import { CodePuppyCatalog, toTemplates, toToolCount } from './mcpCatalog'
import { locateCodePuppy } from './locateCodePuppy'
import { npmRegistry, packageMirrors, toAcpSpec } from './mcpSpec'

const raw = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: id,
  displayName: id.toUpperCase(),
  description: `The ${id} server`,
  category: 'Database',
  tags: ['db'],
  verified: true,
  type: 'stdio',
  config: { command: 'npx', args: ['-y', `server-${id}`, '${db_path}'], env: { KEY: '$API_KEY' } },
  settings: [{ name: 'db_path', label: 'Path to the database', default: './x.db', required: true }],
  keys: ['API_KEY'],
  missing: [],
  deprecated: false,
  ...overrides,
})

describe('toTemplates', () => {
  it('turns settings into plain fields and keys into secret ones, keeping the placeholders in the spec', () => {
    const [template] = toTemplates([raw('sqlite')])
    expect(template.spec).toEqual({ type: 'stdio', command: 'npx', args: ['-y', 'server-sqlite', '${db_path}'], env: { KEY: '$API_KEY' } })
    expect(template.entry.fields).toEqual([
      { name: 'db_path', label: 'Path to the database', default: './x.db', required: true, secret: false },
      { name: 'API_KEY', label: 'API_KEY', default: '', required: true, secret: true },
    ])
    expect(template.entry).toMatchObject({ id: 'sqlite', category: 'Database', unavailable: null, deprecated: false })
  })

  it('says what a server needs that this Mac lacks, and flags deprecated ones', () => {
    const [template] = toTemplates([raw('k8s', { missing: ['kubectl', 'helm'], deprecated: true })])
    expect(template.entry).toMatchObject({ unavailable: 'Needs kubectl, helm', deprecated: true })
  })

  it('drops incomplete or unsafe entries, lists a field once, and sorts by name', () => {
    const templates = toTemplates([
      raw('zeta', { keys: ['db_path'] }), // a key with a setting's name: one field, not two
      raw('broken', { config: { args: [] } }),
      raw('remote', { type: 'http', config: { url: 'http://evil.example.com/mcp' } }),
      raw('alpha'),
      null,
    ])
    expect(templates.map(({ entry }) => entry.id)).toEqual(['alpha', 'zeta'])
    expect(templates[1].entry.fields.map((field) => field.name)).toEqual(['db_path'])
  })

  it('refuses output that is not a list', () => {
    expect(() => toTemplates(null)).toThrow(/catalog/)
  })
})

describe('toToolCount', () => {
  it('returns the count, or fails with what the server said', () => {
    expect(toToolCount({ tools: 4 })).toBe(4)
    expect(() => toToolCount({ error: 'npm ERR! 404 Not Found' })).toThrow('npm ERR! 404 Not Found')
    expect(() => toToolCount(null)).toThrow('The server did not start.')
  })
})

describe('CodePuppyCatalog', () => {
  it('hands the server to the check on stdin, never in its arguments (where ps would show its keys)', async () => {
    let seen: { args: string[]; input?: string } = { args: [] }
    const run: Runner = async (_python, args, _timeout, input) => {
      seen = { args, input }
      return `${SENTINEL}${JSON.stringify({ tools: 2 })}\n`
    }
    const server = { name: 'gh', command: 'npx', args: [], env: [{ name: 'GITHUB_TOKEN', value: 'ghp_secret' }] }
    expect(await new CodePuppyCatalog(() => 'python3', 'https://registry/', run).check(server)).toBe(2)
    expect(seen.args.join(' ')).not.toContain('ghp_secret')
    expect(JSON.parse(seen.input ?? '{}')).toEqual(server)
  })
})

// Real Code Puppy and Walmart's npm mirror: PUPPY_LIVE_AGENTS=1 npx vitest run src/main/mcpCatalog.test.ts
describe.skipIf(!process.env.PUPPY_LIVE_AGENTS)("against the real Code Puppy and Walmart's npm mirror", () => {
  const catalog = new CodePuppyCatalog(() => pythonNextTo(locateCodePuppy()), npmRegistry())

  it('lists only servers whose package exists, and starts one for real', async () => {
    const templates = await catalog.list()
    const ids = templates.map(({ entry }) => entry.id)
    expect(ids).toContain('filesystem')
    expect(ids).not.toContain('fetch') // @modelcontextprotocol/server-fetch was never published to npm
    const filesystem = templates.find(({ entry }) => entry.id === 'filesystem')!
    expect(await catalog.check(toAcpSpec(filesystem.spec, 'filesystem', {}, packageMirrors()))).toBeGreaterThan(0)
  }, 240_000)

  it("fails a server that cannot start, with npm's own explanation", async () => {
    const server = toAcpSpec({ type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-fetch'], env: {} }, 'fetch', {}, packageMirrors())
    await expect(catalog.check(server)).rejects.toThrow(/404|not found|not in this registry/i)
  }, 240_000)
})
