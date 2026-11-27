import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { AGENT, expect, sendAndWait, shot, test, useApp } from './fixtures'

// Code Puppy's real catalog, real npm packages through Walmart's mirror, and a throwaway profile with its own Keychain item.
const profile = mkdtempSync(join(tmpdir(), 'puppy-e2e-catalog-'))
const { page } = useApp({ PUPPY_DESKTOP_USER_DATA: profile })
const FAKE_KEY = 'ghp_e2eFakeKey4217notReal'
/** Only the filesystem server (limited to /tmp) can tell the model this name. */
const MARKER = `puppy-catalog-${process.pid}.txt`

// In a hook, not at the top: Playwright loads spec files in more than one process.
test.beforeAll(() => writeFileSync(join('/tmp', MARKER), 'hello'))
test.afterAll(() => {
  rmSync(join('/tmp', MARKER), { force: true })
  try {
    execFileSync('/usr/bin/security', ['delete-generic-password', '-s', `Puppy MCP keys (${basename(profile)})`, '-a', 'mcp-keys'], { stdio: 'ignore' })
  } catch {
    // never created
  }
})

const onDisk = () => ['mcp-servers.json', 'mcp-secrets.json'].map((file) => join(profile, file)).filter(existsSync).map((file) => readFileSync(file, 'utf8')).join('\n')
const catalog = () => page().getByRole('list', { name: 'Catalog servers' })
const yours = () => page().getByRole('list', { name: 'Your servers' })
const row = (name: string) => catalog().getByRole('listitem').filter({ has: page().getByRole('heading', { name, exact: true }) })

test("Code Puppy's catalog lists what runs here, and says what this Mac lacks", async () => {
  await page().getByRole('button', { name: 'MCP servers' }).click()
  await expect(row('Filesystem Access')).toBeVisible(AGENT) // read through Code Puppy, packages looked up on npm
  const search = page().getByLabel('Search the catalog')
  await search.fill('Web Fetch') // its npm package was never published
  await expect(page().getByText('Nothing matches "Web Fetch".')).toBeVisible()
  await search.fill('SQLite')
  await row('SQLite Database').getByRole('button', { name: 'Add SQLite Database' }).click()
  const form = page().getByRole('form', { name: 'Settings for SQLite Database' })
  await expect(form.getByLabel('Path to SQLite database file')).toBeFocused()
  await shot(page(), 'mcp-catalog-form')
  await form.getByRole('button', { name: 'Cancel' }).click()
  await search.fill('')
})

test("one that cannot start is not added, and the server's own reason is shown", async () => {
  await page().getByLabel('Search the catalog').fill('Slack')
  await row('Slack Integration').getByRole('button', { name: 'Add Slack Integration' }).click()
  const form = page().getByRole('form', { name: 'Settings for Slack Integration' })
  await expect(form.getByLabel('SLACK_TOKEN')).toHaveAttribute('type', 'password')
  await form.getByLabel('SLACK_TOKEN').fill('xoxb-e2e-not-real')
  await form.getByRole('button', { name: 'Add Slack Integration' }).click()
  // Code Puppy's catalog asks for SLACK_TOKEN; the server wants two other variables, and says so.
  await expect(row('Slack Integration').getByRole('alert')).toContainText(/did not start, so it was not added[\s\S]*SLACK_BOT_TOKEN/, AGENT)
  await expect(yours()).toHaveCount(0)
  expect(onDisk()).not.toContain('xoxb-e2e-not-real')
  await form.getByRole('button', { name: 'Cancel' }).click()
})

test('a key is checked by starting the server, kept encrypted, never shown again, and forgotten on removal', async () => {
  await page().getByLabel('Search the catalog').fill('GitHub API')
  await row('GitHub API').getByRole('button', { name: 'Add GitHub API' }).click()
  const form = page().getByRole('form', { name: 'Settings for GitHub API' })
  await form.getByLabel('GITHUB_TOKEN').fill(FAKE_KEY)
  await form.getByRole('button', { name: 'Add GitHub API' }).click()
  await expect(yours().getByRole('switch', { name: 'GitHub API' })).toBeVisible(AGENT)
  await expect(row('GitHub API').getByText('Added')).toBeVisible()

  expect(onDisk()).toContain('$GITHUB_TOKEN') // the placeholder; the key itself only encrypted
  expect(onDisk()).toContain('catalog:github')
  expect(onDisk()).not.toContain(FAKE_KEY)
  expect(await page().content()).not.toContain(FAKE_KEY)

  await page().getByRole('button', { name: 'Remove GitHub API' }).click()
  await expect(yours()).toHaveCount(0)
  expect(onDisk()).not.toContain('catalog:github')
})

test('a server that needs nothing is added once it starts, and a new chat uses its tools', async () => {
  await page().getByLabel('Search the catalog').fill('Filesystem Access')
  await row('Filesystem Access').getByRole('button', { name: 'Add Filesystem Access' }).click()
  await expect(yours().getByRole('switch', { name: 'Filesystem Access' })).toBeVisible(AGENT)
  await shot(page(), 'mcp-catalog')

  await page().getByRole('button', { name: 'New chat' }).click()
  await sendAndWait(page(), "Use the list_directory tool from the filesystem MCP server on /tmp, then reply with only the name of the file that starts with 'puppy-catalog-'.")
  const log = page().getByRole('log', { name: 'Conversation' })
  await expect(log.getByText(/^filesystem_list_directory/).first()).toBeVisible() // its tool card: the catalog server really ran
  await expect(log.getByText(MARKER).last()).toBeVisible()
  await shot(page(), 'mcp-catalog-in-chat')
})
