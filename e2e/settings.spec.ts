import { expect, shot, test, useApp } from './fixtures'

const { page } = useApp()
const isDark = () => page().evaluate(() => window.matchMedia('(prefers-color-scheme: dark)').matches)

test('quick toggle flips between light and dark', async () => {
  const startedDark = await isDark()
  await page().getByRole('button', { name: startedDark ? 'Switch to light mode' : 'Switch to dark mode' }).click()
  await expect.poll(isDark).toBe(!startedDark)
  await shot(page(), startedDark ? '06-light' : '06-dark')
  await page().getByRole('button', { name: startedDark ? 'Switch to dark mode' : 'Switch to light mode' }).click()
  await expect.poll(isDark).toBe(startedDark)
})

test('settings page: theme cards, name, model, smart titles', async () => {
  await page().getByRole('button', { name: 'Settings' }).click()
  await expect(page().getByRole('heading', { name: 'Settings' })).toBeVisible()

  await page().getByRole('radio', { name: 'Dark' }).click()
  await expect.poll(isDark).toBe(true)
  await expect(page().getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
  await shot(page(), '07-settings-dark')
  await page().getByRole('radio', { name: 'Light' }).click()
  await expect.poll(isDark).toBe(false)
  await shot(page(), '08-settings-light')

  await expect(page().getByRole('button', { name: /^Model:/ })).toBeVisible()
  const smartTitles = page().getByRole('switch', { name: 'Smart titles' })
  await expect(smartTitles).toHaveAttribute('aria-checked', 'true')

  const name = page().getByLabel('What should Puppy call you?')
  await name.fill('Testy')
  await name.press('Enter')
  await page().getByRole('button', { name: 'Chat', exact: true }).click()
  await expect(page().getByRole('heading', { name: /, Testy$/ })).toBeVisible()
})

test('settings: previews switch', async () => {
  await page().getByRole('button', { name: 'Settings' }).click()
  const auto = page().getByRole('switch', { name: 'Open previews automatically' })
  await expect(auto).toHaveAttribute('aria-checked', 'true') // on by default
  await auto.click()
  await expect(auto).toHaveAttribute('aria-checked', 'false')
  expect((await page().evaluate(() => window.puppy.getSettings())).autoPreview).toBe(false)
  await auto.click()
  await expect(auto).toHaveAttribute('aria-checked', 'true')

  await page().getByRole('button', { name: 'Chat', exact: true }).click()
})

test('settings: thinking mode is off until switched on, and sticks', async () => {
  await page().getByRole('button', { name: 'Settings' }).click()
  const thinking = page().getByRole('switch', { name: "Show Code Puppy's work" })
  await expect(thinking).toHaveAttribute('aria-checked', 'false') // off by default
  await thinking.click()
  await expect(thinking).toHaveAttribute('aria-checked', 'true')
  expect((await page().evaluate(() => window.puppy.getSettings())).thinkingMode).toBe(true)
  await thinking.click()
  await expect(thinking).toHaveAttribute('aria-checked', 'false')

  await page().getByRole('button', { name: 'Chat', exact: true }).click()
})

test('settings persist across a restart of the page', async () => {
  await page().reload()
  await expect(page().getByRole('heading', { name: /, Testy$/ })).toBeVisible()
  expect(await isDark()).toBe(false)
})
