import { expect, sendAndWait, shot, sidebar, test, useApp } from './fixtures'

const { page } = useApp()

test.beforeAll(async () => {
  await page().evaluate(() => window.puppy.updateSettings({ smartTitles: false })) // keep titles predictable
  await sendAndWait(page(), 'Reply with exactly one word: ok')
})

test('rename: inline edit from the row menu', async () => {
  const row = sidebar(page()).locator('li').first()
  await row.hover()
  await row.getByRole('button', { name: /^Options for/ }).click()
  await page().getByRole('menuitem', { name: 'Rename' }).click()
  const input = page().getByRole('textbox', { name: 'Conversation title' })
  await input.fill('Renamed by the test')
  await input.press('Enter')
  await expect(sidebar(page()).getByText('Renamed by the test')).toBeVisible()
  await expect(page().getByRole('heading', { level: 1, name: 'Renamed by the test' })).toBeVisible()
})

test('delete: asks first, then removes the conversation', async () => {
  const row = sidebar(page()).locator('li').first()
  await row.hover()
  await row.getByRole('button', { name: /^Options for/ }).click()
  await page().getByRole('menuitem', { name: 'Delete' }).click()
  await expect(page().getByRole('dialog', { name: 'Delete conversation?' })).toBeVisible()
  await shot(page(), '05-delete-confirm')
  await page().getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page().getByText('No chats yet.')).toBeVisible()
  // Gone from Code Puppy too, not just hidden.
  expect(await page().evaluate(() => window.puppy.listSessions())).toHaveLength(0)
})
