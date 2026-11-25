import { expect, shot, test, useApp } from './fixtures'

const { app, page } = useApp()

/** Say what the main process says when its background check finds (or loses) an update. */
const announce = (available: boolean) =>
  app().evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0].webContents.send('app:update-available-changed', value), available)

test('the update badge sits beside the theme toggle, only while an update is waiting', async () => {
  const badge = page().getByRole('button', { name: 'Update available: update Puppy' })
  await expect(badge).toBeHidden() // a dev build has nothing to update, so no badge by default

  await announce(true)
  await expect(badge).toBeVisible()
  await expect(badge).toHaveAttribute('title', 'Update ready. Click to update Puppy')
  await shot(page(), '10-update-badge')

  // It lives in the same row as the light/dark toggle.
  const toggle = page().getByRole('button', { name: /Switch to (light|dark) mode/ })
  const [badgeBox, toggleBox] = [await badge.boundingBox(), await toggle.boundingBox()]
  expect(Math.abs(badgeBox!.y - toggleBox!.y)).toBeLessThan(8)
  expect(badgeBox!.x).toBeLessThan(toggleBox!.x)

  await announce(false)
  await expect(badge).toBeHidden()
})

test('clicking the badge from a dev build explains why it cannot update here', async () => {
  await announce(true)
  await page().getByRole('button', { name: 'Update available: update Puppy' }).click()
  await expect(page().getByRole('alert').filter({ hasText: 'running Puppy from source' })).toBeVisible()
})
