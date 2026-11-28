import { expect, sendAndWait, shot, sidebar, test, useApp } from './fixtures'

// Typed but not sent: the text must survive going elsewhere, against the real Code Puppy.
const { page } = useApp()

const box = () => page().getByLabel('Message Code Puppy')
const openChat = (word: string) => sidebar(page()).getByRole('button', { name: new RegExp(`Say only the word ${word}`) }).first().click()

test('unsent text is still in the box after going to another chat, to Settings, and back', async () => {
  await page().evaluate(() => window.puppy.updateSettings({ smartTitles: false })) // keep titles predictable
  await page().getByRole('button', { name: 'New chat' }).click()
  await sendAndWait(page(), 'Say only the word alpha.')
  await box().fill('A half-written thought,\nover two lines')

  await page().getByRole('button', { name: 'New chat' }).click()
  await expect(box()).toHaveValue('') // the home screen has a box of its own
  await box().fill('An idea for a new chat')

  await openChat('alpha')
  await expect(box()).toHaveValue('A half-written thought,\nover two lines')

  await page().getByRole('button', { name: 'Settings', exact: true }).click()
  await page().getByRole('button', { name: 'Close settings' }).click()
  await expect(box()).toHaveValue('A half-written thought,\nover two lines')

  await page().getByRole('button', { name: 'New chat' }).click()
  await expect(box()).toHaveValue('An idea for a new chat')
  await shot(page(), 'draft-kept')
})

test('unsent text survives a restart of the window, and is gone once sent', async () => {
  await page().reload()
  await expect(page().getByText('Code Puppy is ready')).toBeVisible({ timeout: 60_000 })
  await expect(box()).toHaveValue('An idea for a new chat')
  await openChat('alpha')
  await expect(box()).toHaveValue('A half-written thought,\nover two lines')

  await box().fill('Say only the word beta.')
  await page().keyboard.press('Enter')
  await expect(page().getByRole('button', { name: 'Send message' })).toBeVisible({ timeout: 120_000 })
  await expect(box()).toHaveValue('')
  await page().getByRole('button', { name: 'New chat' }).click()
  await openChat('alpha')
  await expect(box()).toHaveValue('') // sent, so nothing is kept
})
