import { AGENT, expect, sendAndWait, sidebar, test, useApp } from './fixtures'

const { page } = useApp()

// Markdown bullet lists: every item is its own line (plain newlines would be merged into one paragraph).
// They open differently on purpose: the sidebar title is the first words, and the two must be told apart.
const first = 'Alpha list: a markdown bulleted list with 60 bullets, each exactly "Alpha N" for N from 1 to 60, and nothing else.'
const second = 'Bravo list: a markdown bulleted list with 60 bullets, each exactly "Bravo N" for N from 1 to 60, and nothing else.'
const chat = (word: string) => sidebar(page()).getByText(new RegExp(`^${word} list`))

/** The conversation's scrolling pane: the closest scrollable ancestor of the log. */
const pane = () => page().getByRole('log', { name: 'Conversation' }).locator('xpath=ancestor::div[contains(@class, "overflow-y-auto")][1]')
const distanceFromBottom = () => pane().evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)

test.beforeAll(async () => {
  await page().evaluate(() => window.puppy.updateSettings({ smartTitles: false })) // keep titles predictable
  await sendAndWait(page(), first)
  await page().getByRole('button', { name: 'New chat' }).click()
  await sendAndWait(page(), second)
})

test('opening a conversation lands on its latest message, even when the last one was left scrolled up', async () => {
  await chat('Alpha').click()
  await expect.poll(() => pane().evaluate((el) => el.scrollHeight > el.clientHeight * 1.5)).toBe(true) // long enough to matter
  await expect.poll(distanceFromBottom).toBeLessThan(8)

  // Scroll to the top like a reader would, then go straight to the other long conversation.
  await pane().evaluate((el) => void (el.scrollTop = 0))
  await expect.poll(distanceFromBottom).toBeGreaterThan(200)
  await chat('Bravo').click()
  await expect(page().getByRole('log', { name: 'Conversation' }).getByText('Bravo 60', { exact: true })).toBeVisible()
  await expect.poll(distanceFromBottom).toBeLessThan(8)

  // And back again: still at the end, not wherever Bravo was.
  await pane().evaluate((el) => void (el.scrollTop = 0))
  await expect.poll(distanceFromBottom).toBeGreaterThan(200)
  await chat('Alpha').click()
  await expect.poll(distanceFromBottom).toBeLessThan(8)
})

test('a saved conversation reopened after a restart also starts at the end', async () => {
  await page().reload()
  await expect(page().getByText('Code Puppy is ready')).toBeVisible(AGENT)
  await chat('Alpha').click()
  await expect(page().getByRole('log', { name: 'Conversation' }).getByText('Alpha 60', { exact: true })).toBeVisible(AGENT)
  await expect.poll(distanceFromBottom).toBeLessThan(8)
})
