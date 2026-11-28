import { expect, sendAndWait, shot, test, useApp } from './fixtures'

const { app, page } = useApp()

const toggle = () => page().getByRole('switch', { name: 'Switch models automatically' })
const field = (name: 'Main model' | 'Secondary model') => page().getByRole('button', { name: new RegExp(`^${name}:`) })
const settings = () => page().evaluate(() => window.puppy.getSettings())

test('switching models automatically is off until switched on, and asks for both models', async () => {
  await page().getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page().getByRole('heading', { name: 'Usage limits' })).toBeVisible()
  await expect(toggle()).toHaveAttribute('aria-checked', 'false') // off by default
  await expect(field('Main model')).toHaveCount(0)
  expect((await settings()).modelFallback).toEqual({ enabled: false, main: null, secondary: null })

  await toggle().click()
  await expect(toggle()).toHaveAttribute('aria-checked', 'true')
  await expect(field('Secondary model')).toHaveAccessibleName('Secondary model: Choose a model')
  await expect(page().getByText('Choose both models to start using this.')).toBeVisible()
  // The main model starts as the one in use, so there is only one more thing to choose.
  await expect(field('Main model')).not.toHaveAccessibleName('Main model: Choose a model')
  expect((await settings()).modelFallback.main).not.toBeNull()
  await shot(page(), 'fallback-settings-half')
})

test('each role offers every model but the other role\'s, and the choice is kept', async () => {
  await field('Secondary model').click()
  const secondaryList = page().getByRole('listbox', { name: 'Secondary model' })
  const mainValue = (await settings()).modelFallback.main!
  const names = await secondaryList.getByRole('option').allInnerTexts()
  expect(names.length).toBeGreaterThan(1)
  const secondaryName = names[0].split('\n')[0]
  await secondaryList.getByRole('option').first().click()
  await expect(field('Secondary model')).toHaveAccessibleName(`Secondary model: ${secondaryName}`) // saved, then shown

  const saved = (await settings()).modelFallback
  expect(saved).toMatchObject({ enabled: true, main: mainValue })
  expect(saved.secondary).not.toBeNull()
  expect(saved.secondary).not.toBe(saved.main)
  await expect(page().getByRole('status').filter({ hasText: 'runs out of usage' })).toContainText('Puppy will carry on with')
  await shot(page(), 'fallback-settings-ready')

  // The main model can no longer be the secondary one, and vice versa.
  await field('Main model').click()
  await expect(page().getByRole('listbox', { name: 'Main model' }).getByRole('option').filter({ has: page().getByText(secondaryName, { exact: true }) })).toHaveCount(0)
  await page().keyboard.press('Escape')
})

test('turning it off keeps the models, and the setting survives a reload of the page', async () => {
  const before = (await settings()).modelFallback
  await toggle().click()
  await expect(toggle()).toHaveAttribute('aria-checked', 'false')
  await expect(field('Main model')).toHaveCount(0)
  expect(await settings().then((s) => s.modelFallback)).toEqual({ ...before, enabled: false })

  await page().reload()
  await expect(page().getByText('Code Puppy is ready')).toBeVisible({ timeout: 60_000 })
  await page().getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(toggle()).toHaveAttribute('aria-checked', 'false')
  await toggle().click()
  await expect(field('Main model')).toHaveAccessibleName(/^Main model: /)
  await expect(field('Secondary model')).not.toHaveAccessibleName('Secondary model: Choose a model') // still chosen
  await toggle().click() // leave it off, as the user found it
})

test('a chat says so when Puppy switched models for it, in the models\' own names', async () => {
  await page().getByRole('button', { name: 'Close settings' }).click()
  await page().getByRole('button', { name: 'New chat' }).click()
  await sendAndWait(page(), 'Say only the word hi.')
  const { sessionId, options } = await page().evaluate(async () => {
    const [saved] = await window.puppy.listSessions()
    return { sessionId: saved.sessionId, options: await window.puppy.getConfigOptions() }
  })
  const model = options.find((option) => option.id === 'model')
  expect(model?.type).toBe('select')
  // What the main process sends after it moves a chat to its secondary model (the real move needs a spent quota).
  await app().evaluate(({ BrowserWindow }, change) => BrowserWindow.getAllWindows()[0].webContents.send('model:switched', change), {
    sessionId,
    from: 'claude-opus-5-5',
    to: 'claude-sonnet-5-5',
  })
  const log = page().getByRole('log', { name: 'Conversation' })
  await expect(log.getByRole('status').filter({ hasText: 'has reached its usage limit' })).toContainText('Puppy switched this chat to')
  await expect(log.getByRole('status').filter({ hasText: 'has reached its usage limit' })).toContainText('New chats still start on')
  await expect(page().getByRole('button', { name: /^Model:/ })).toHaveAccessibleName(/Sonnet/i) // that chat's picker shows its new model
  await shot(page(), 'fallback-note')
})
