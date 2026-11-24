import { AGENT, expect, sendAndWait, shot, sidebar, test, useApp } from './fixtures'

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
