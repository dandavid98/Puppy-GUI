import { AGENT, expect, sendAndWait, shot, sidebar, test, useApp } from './fixtures'
import { noisyPng } from './noisyPng'

const { page } = useApp()

test('home: fresh profile, no foreign sessions, model list preloaded', async () => {
  await expect(page().getByRole('button', { name: 'New chat' })).toBeVisible()
  // Sessions from other ACP clients / earlier runs must not leak into a fresh profile.
  await expect(page().getByText('No chats yet.')).toBeVisible()
  await expect(page().getByRole('button', { name: /^Model:/ })).toBeVisible()
  await shot(page(), '01-home')
})

test('model dropdown: custom listbox with keyboard support', async () => {
  const trigger = page().getByRole('button', { name: /^Model:/ })
  await trigger.click()
  const list = page().getByRole('listbox', { name: 'Model' })
  await expect(list).toBeVisible()
  await expect(list.getByRole('option', { selected: true })).toHaveCount(1)
  await shot(page(), '02-model-dropdown')
  await page().keyboard.press('Escape')
  await expect(list).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('slash menu: suggests commands as you type', async () => {
  const composer = page().getByLabel('Message Code Puppy')
  await composer.fill('/')
  const menu = page().getByRole('listbox', { name: 'Commands' })
  await expect(menu).toBeVisible()
  await expect(composer).toHaveAttribute('aria-expanded', 'true')
  await shot(page(), '02b-slash-menu')
  await page().keyboard.press('Tab')
  await expect(composer).toHaveValue(/^\/\S+ $/) // picked a command, ready for arguments
  await expect(menu).toBeHidden()
  await composer.fill('/')
  await page().keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await composer.fill('')
})

test('chat: streams a reply and lists the conversation', async () => {
  await sendAndWait(page(), 'Reply with exactly one word: woof')
  const log = page().getByRole('log', { name: 'Conversation' })
  await expect(log.locator('.prose').getByText(/woof/i)).toBeVisible()
  await expect(sidebar(page()).getByRole('button', { name: /./ }).first()).toBeVisible()
  await shot(page(), '03-chat')
})

test('smart title replaces the first-message title', async () => {
  const rows = sidebar(page()).locator('li button[aria-current]')
  await expect(rows.first()).not.toHaveText(/Reply with exactly one word/, AGENT)
})

test('attachments: a text file is sent as context', async () => {
  await page().locator('input[type=file]').setInputFiles({
    name: 'secret.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('The secret password is marshmallow.\n'),
  })
  await expect(page().getByRole('list', { name: 'Attachments' }).getByText('secret.txt')).toBeVisible()
  await page().locator('input[type=file]').setInputFiles({ name: 'tool.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') })
  await expect(page().getByRole('alert').getByText(/tool\.exe can't be attached/)).toBeVisible()

  await sendAndWait(page(), 'What is the secret password in the attached file? One word.')
  const log = page().getByRole('log', { name: 'Conversation' })
  await expect(log.getByRole('list', { name: 'Attachments' }).getByText('secret.txt')).toBeVisible()
  await expect(log.locator('.prose').last()).toContainText(/marshmallow/i)
  await shot(page(), '03b-attachment')
})

const MB = 1024 * 1024
const chips = () => page().getByRole('list', { name: 'Attachments' })

test('a huge image (over the old 5 MB limit) is shrunk to fit and still sent', async () => {
  const huge = noisyPng(1800) // random noise: incompressible, so about 9.7 MB as a PNG
  expect(huge.length, 'precondition: bigger than the old limit').toBeGreaterThan(5 * MB)

  await page().locator('input[type=file]').setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: huge })
  await expect(page().getByRole('status').getByText(/huge\.png was shrunk to fit \(\d+\.\d MB to \d\.\d MB\)\./)).toBeVisible({ timeout: 60_000 })
  await expect(page().getByRole('alert')).toHaveCount(0)

  // The thumbnail's src is exactly what gets sent: it must be well under the 5 MB the model allows.
  const chip = chips().getByRole('img', { name: /^huge\.(png|jpg)$/ })
  await expect(chip).toBeVisible()
  const sent = (await chip.getAttribute('src'))!
  expect(sent.length).toBeLessThan(5 * MB)
  expect(sent).toMatch(/^data:image\/(png|jpeg);base64,/)
  await shot(page(), '17-image-shrunk')

  // And the model really accepts it (a 9.7 MB image would have been refused).
  await sendAndWait(page(), 'Reply with exactly one word: seen')
  const log = page().getByRole('log', { name: 'Conversation' })
  await expect(log.locator('.prose').last()).toContainText(/seen/i, AGENT)
  await expect(page().getByRole('status').getByText(/was shrunk to fit/)).toHaveCount(0) // the note clears once sent
})

test('a small image is sent byte for byte, with no fuss', async () => {
  const onePixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  await page().locator('input[type=file]').setInputFiles({ name: 'dot.png', mimeType: 'image/png', buffer: Buffer.from(onePixel, 'base64') })
  const chip = chips().getByRole('img', { name: 'dot.png' })
  await expect(chip).toBeVisible()
  expect(await chip.getAttribute('src')).toBe(`data:image/png;base64,${onePixel}`)
  await expect(page().getByRole('status').getByText(/shrunk|Preparing/)).toHaveCount(0)
  await page().getByRole('button', { name: 'Remove dot.png' }).click()
})

test('an image over 30 MB is refused, in plain words', async () => {
  await page().locator('input[type=file]').setInputFiles({ name: 'giant.png', mimeType: 'image/png', buffer: Buffer.alloc(31 * MB) })
  await expect(page().getByRole('alert').getByText('giant.png is over 30 MB.')).toBeVisible()
  await expect(chips().getByRole('img', { name: 'giant.png' })).toHaveCount(0)
})

test('a new chat gets its sidebar row the moment you send, not when the reply ends', async () => {
  await page().getByRole('button', { name: 'New chat' }).click()
  const rows = sidebar(page()).locator('li > button')
  const before = await rows.count()

  await page().getByLabel('Message Code Puppy').fill('Write a 300 word story about a puppy who learns to code.')
  await page().keyboard.press('Enter')

  await expect(rows).toHaveCount(before + 1, { timeout: 5_000 }) // a long reply is still being written
  await expect(page().getByRole('button', { name: 'Stop' })).toBeVisible()
  await expect(rows.first()).toContainText('Write a 300 word story') // titled from the message, like the real title will be

  await expect(page().getByRole('button', { name: 'Send message' })).toBeVisible(AGENT)
  await expect(rows).toHaveCount(before + 1) // the real list took over, with no duplicate
})
