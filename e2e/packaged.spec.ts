import { AGENT, expect, sendAndWait, shot, test, useApp } from './fixtures'

// Only meaningful against the installed app: PUPPY_APP=~/Applications/Puppy.app/Contents/MacOS/Puppy
test.skip(!process.env.PUPPY_APP, 'set PUPPY_APP to smoke-test the installed app')

const { app, page } = useApp()

test('installed app runs packaged, connects and answers', async () => {
  expect(await app().evaluate(({ app: electronApp }) => electronApp.isPackaged)).toBe(true)
  await expect(page().getByRole('button', { name: /^Model:/ })).toBeVisible(AGENT)
  await sendAndWait(page(), 'Reply with exactly one word: pong')
  await expect(page().getByRole('log', { name: 'Conversation' }).locator('.prose')).toContainText(/pong/i)
  await shot(page(), '10-packaged')
})

// Finder-launched apps get no shell PATH; the quota reader must not depend on one.
test('installed app reads the real quota and shows it on the model rings', async () => {
  const quota = await page().evaluate(() => window.puppy.refreshQuota())
  expect(quota, 'quota unreadable from the packaged app').not.toBeNull()
  expect(Object.keys(quota!.burnRates).length).toBeGreaterThan(5)
  await page().getByRole('button', { name: /^Model:/ }).click()
  await expect(page().getByTestId('quota-summary')).toHaveText(/^Large \d+% · Others \d+% · resets in /)
  await page().keyboard.press('Escape')
})

test('installed app: clicking the context meter shows the numbers', async () => {
  await page().getByTestId('context-meter').click()
  await expect(page().getByTestId('context-details')).toContainText(/\d+(\.\d)?k of \d+k\s*tokens used/)
  await page().keyboard.press('Escape')
})
