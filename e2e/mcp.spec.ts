import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AGENT, expect, sendAndWait, shot, test, useApp } from './fixtures'
import { SECRET, startMcpServer } from './mcpServer'

// A throwaway profile, seeded with two servers before Puppy starts: one real, one where nothing listens.
const PORT = 41_000 + Math.floor(Math.random() * 9_000)
const profile = mkdtempSync(join(tmpdir(), 'puppy-e2e-mcp-'))
const serversFile = join(profile, 'mcp-servers.json')
const server = (id: string, displayName: string, port: number) => ({ id, name: id, displayName, type: 'http', url: `http://127.0.0.1:${port}/mcp`, headers: {}, enabled: true })
writeFileSync(serversFile, JSON.stringify([server('localtest', 'Local test server', PORT), server('deadtest', 'Unreachable server', PORT + 1)]))

let mcp: Awaited<ReturnType<typeof startMcpServer>>
test.beforeAll(async () => {
  mcp = await startMcpServer(PORT) // registered before useApp, so it is listening before Puppy starts
})
const { page } = useApp({ PUPPY_DESKTOP_USER_DATA: profile })
test.afterAll(() => mcp?.close())

const savedServers = () => JSON.parse(readFileSync(serversFile, 'utf8')) as { id: string; enabled: boolean; headers: Record<string, string> }[]

test('a chat uses a tool from a server added in Puppy, and an unreachable one does not break it', async () => {
  await sendAndWait(page(), 'Call the secret_word tool from the localtest MCP server, then reply with exactly the word it returned and nothing else.')
  const log = page().getByRole('log', { name: 'Conversation' })
  await expect(log.getByText(SECRET).last()).toBeVisible()
  expect(mcp.calls).toContain('tools/call')
  await shot(page(), 'mcp-tool-in-chat')
})

test('the MCP servers page lists them; one can be switched off and removed', async () => {
  await page().getByRole('button', { name: 'MCP servers' }).click()
  await expect(page().getByRole('heading', { name: 'MCP servers', level: 1 })).toBeVisible()
  const yours = page().getByRole('list', { name: 'Your servers' })
  await expect(yours.getByRole('switch', { name: 'Local test server' })).toHaveAttribute('aria-checked', 'true')
  await expect(page().getByRole('status').filter({ hasText: /Signed in\.|Not signed in/ })).toBeVisible(AGENT)

  await page().getByRole('button', { name: 'Remove Unreachable server' }).click()
  await yours.getByRole('switch', { name: 'Local test server' }).click()
  await expect(yours.getByRole('switch', { name: 'Local test server' })).toHaveAttribute('aria-checked', 'false')
  await expect(yours.getByRole('listitem')).toHaveCount(1)
  expect(savedServers()).toMatchObject([{ id: 'localtest', enabled: false }])
  await shot(page(), 'mcp-page')
})

test('the Walmart marketplace can be searched, and a server added without saving any token', async () => {
  const market = page().getByRole('list', { name: 'Marketplace servers' })
  await expect(market.getByRole('listitem').first()).toBeVisible(AGENT) // read through code-puppy, over the VPN
  await page().getByLabel('Search the marketplace').fill('accelerator mcp')
  await page().getByRole('button', { name: 'Add Accelerator MCP Server' }).click()
  const yours = page().getByRole('list', { name: 'Your servers' })
  await expect(yours.getByRole('switch', { name: 'Accelerator MCP Server' })).toBeVisible(AGENT)
  await expect(market.getByText('Added')).toBeVisible()

  const added = savedServers().find((saved) => saved.id === 'wmt-accelerator-mcp')
  expect(added?.headers.Authorization).toBe('Bearer $PUPPY_MARKETPLACE_TOKEN') // the placeholder, filled in only in memory
  expect(readFileSync(serversFile, 'utf8')).not.toMatch(/eyJ[\w-]{10,}\./)
  await shot(page(), 'mcp-marketplace')

  await page().getByRole('button', { name: 'Remove Accelerator MCP Server' }).click()
  await expect(yours.getByRole('switch', { name: 'Accelerator MCP Server' })).toHaveCount(0)
})
