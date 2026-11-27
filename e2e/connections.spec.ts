import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { AGENT, expect, test, useApp } from './fixtures'

// A throwaway profile, and a throwaway "ScanMatcher" .env.local whose token the test rewrites to age it.
const profile = mkdtempSync(join(tmpdir(), 'puppy-e2e-connections-'))
const envFile = join(mkdtempSync(join(tmpdir(), 'puppy-e2e-scanmatcher-')), '.env.local')
const { page } = useApp({ PUPPY_DESKTOP_USER_DATA: profile })

const HOUR = 3_600_000
const EMAIL = 'daniel@walmart.com'
const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
/** A login token ending `inMs` from now, as ProductWatch's do. */
const tokenEnding = (inMs: number) => `${base64url({ alg: 'HS256' })}.${base64url({ exp: Math.floor((Date.now() + inMs) / 1000), email: EMAIL })}.not-a-real-signature`
let token = ''
const writeToken = (inMs: number) => {
  token = tokenEnding(inMs)
  writeFileSync(envFile, `PW_BASE_URL="https://pw.example.com"\nPW_EMAIL="${EMAIL}"\nPW_TOKEN="${token}"\n`)
}
test.beforeAll(() => writeToken(3 * 24 * HOUR))

const list = () => page().getByRole('list', { name: 'Connections' })
const row = (name: string) => list().getByRole('listitem').filter({ has: page().getByRole('heading', { name, exact: true }) })
const checkAgain = () => page().getByRole('button', { name: 'Check connections again' }).click()
/** A picture of the Connections card itself: the page scrolls inside a container, so a whole-window shot can land anywhere. */
const shootConnections = (name: string) => page().getByRole('region', { name: 'Connections' }).screenshot({ path: join('test-results', `${name}.png`) })

test('the Walmart sign-in is listed with its state', async () => {
  await page().getByRole('button', { name: 'MCP servers' }).click()
  await expect(page().getByRole('heading', { name: 'Connections', level: 2 })).toBeVisible()
  await expect(row('Walmart sign-in')).toContainText(/Connected|Expires soon|Not connected/, AGENT)
})

test('a token file is added by choosing it: Puppy guesses the lines and previews the result, and the token is never shown or copied', async () => {
  await page().getByRole('button', { name: 'Add connection' }).click()
  const form = page().getByRole('form', { name: 'Add a connection' })
  await expect(form.getByRole('button', { name: /ProductWatch/ })).toHaveCount(0) // nothing in the form is specific to one tool

  await form.getByLabel('File that holds the token').fill(envFile)
  await expect(form.getByLabel('Which line is the token?')).toHaveValue('PW_TOKEN') // guessed from what is in the file
  await expect(form.getByLabel('Which line says whose it is? (optional)')).toHaveValue('PW_EMAIL')
  await expect(form.getByRole('radio', { name: 'The token says when' })).toBeChecked() // it is a login token that names its end
  await form.getByLabel('Name', { exact: true }).fill('ProductWatch')
  await form.getByText('Help renewing it (optional)').click()
  await form.getByLabel('Page to renew it').fill('https://pw.example.com')
  await form.getByLabel('How to renew it').fill('1. Sign in\n2. Double-click set-pw-token.command')
  await expect(form.locator('[aria-live=polite]')).toContainText(new RegExp(`ProductWatch · ${EMAIL}\\s*Connected · expires`))
  await shootConnections('connections-form')
  await form.getByRole('button', { name: 'Add connection' }).click()

  await expect(row('ProductWatch')).toContainText(EMAIL)
  await expect(row('ProductWatch')).toContainText(/Connected · expires .* \(in (2d 2\dh|3d)\)/)
  await expect(page().getByRole('button', { name: 'Renew ProductWatch' })).toHaveCount(0) // days left: nothing to do yet
  await shootConnections('connections')

  expect(await page().content()).not.toContain(token)
  expect(readFileSync(join(profile, 'connections.json'), 'utf8')).not.toContain(token)
  expect(readFileSync(join(profile, 'connections.json'), 'utf8')).toContain(envFile) // where to look, not what it says
})

test('it warns in the last day, and when it has ended, with the steps to renew it', async () => {
  writeToken(2 * HOUR)
  await checkAgain()
  await expect(row('ProductWatch')).toContainText(/Expires soon · .* \(in 1h 5\dm\)/)

  await page().getByRole('button', { name: 'Renew ProductWatch' }).click()
  await expect(page().getByText(/set-pw-token\.command/)).toBeVisible()
  await expect(page().getByRole('button', { name: 'Open page' })).toBeVisible()
  await shootConnections('connections-renew')

  writeToken(-HOUR)
  await page().getByRole('button', { name: 'Check again' }).click()
  await expect(row('ProductWatch')).toContainText(/Expired/)
})

test('a renewed token is noticed once the user checks again (as when returning to Puppy)', async () => {
  writeToken(7 * 24 * HOUR) // set-pw-token.command ran
  await page().getByRole('button', { name: 'Check again' }).click()
  await expect(row('ProductWatch')).toContainText(/Connected · expires .* \(in (6d 2\dh|7d)\)/)
  await expect(page().getByRole('button', { name: 'Renew ProductWatch' })).toHaveCount(0)
})

test('a file that cannot be used says why; a plain key asks how it expires; connections can be removed', async () => {
  await page().getByRole('button', { name: 'Add connection' }).click()
  const form = page().getByRole('form', { name: 'Add a connection' })
  const file = form.getByLabel('File that holds the token')
  await file.fill(join(dirname(envFile), 'missing.env'))
  await expect(form.getByRole('alert')).toHaveText('Puppy cannot read missing.env.')

  const keyFile = join(dirname(envFile), 'team.env')
  writeFileSync(keyFile, 'API_KEY=plain-key-123\nUSERNAME=team@walmart.com\n')
  await file.fill(keyFile)
  await expect(form.getByLabel('Which line is the token?')).toHaveValue('API_KEY')
  await expect(form.getByLabel('Which line says whose it is? (optional)')).toHaveValue('USERNAME')
  await expect(form.getByRole('radio', { name: 'The token says when' })).toBeDisabled() // a plain key cannot say
  await expect(form.getByText('This token does not say when it ends, so tell Puppy.')).toBeVisible()
  await expect(form.getByRole('button', { name: 'Add connection' })).toBeDisabled() // until it is answered

  await form.getByRole('radio', { name: /A fixed number of days/ }).check()
  await form.getByLabel('Name', { exact: true }).fill('Team API')
  await expect(form.locator('[aria-live=polite]')).toContainText('Connected · expires')
  await form.getByRole('button', { name: 'Add connection' }).click()
  await expect(row('Team API')).toContainText('team@walmart.com')
  await expect(row('Team API')).toContainText('Counted from when team.env last changed.')

  await page().getByRole('button', { name: 'Remove Team API' }).click()
  await page().getByRole('button', { name: 'Remove ProductWatch' }).click()
  await expect(row('Team API')).toHaveCount(0)
  await expect(row('ProductWatch')).toHaveCount(0)
})
