import type { Locator } from '@playwright/test'
import { AGENT, expect, sendAndWait, shot, sidebar, test, useApp } from './fixtures'

const { page } = useApp()
const modelButton = () => page().getByRole('button', { name: /^Model:/ })

/** Same rounding as the app: anything used shows at least 1%. */
const percent = (used: number, limit: number) => (used > 0 && limit > 0 ? Math.min(100, Math.max(1, Math.round((used / limit) * 100))) : 0)

test('the context meter is always on screen, and says when its number will appear', async () => {
  const meter = page().getByTestId('context-meter')
  await expect(meter).toBeVisible() // before any conversation exists
  await expect(meter).toHaveAttribute('data-known', 'false')
  await expect(meter).toHaveAttribute('aria-label', /will show here after your next message/)
  await expect(meter).toContainText('–')
  await shot(page(), '10-context-meter-empty')
})

test('after a turn the meter shows the context size, just left of the model picker', async () => {
  await sendAndWait(page(), 'Reply with exactly one word: pong')

  const meter = page().getByTestId('context-meter')
  await expect(meter).toHaveAttribute('data-known', 'true', AGENT)
  await expect(meter).toHaveAttribute('aria-label', /Context window: about [\d,]+ of [\d,]+ tokens used \(\d+%\)\. This is an estimate\./)
  await expect(meter).toContainText(/\d/)

  const [meterBox, pickerBox] = await Promise.all([meter.boundingBox(), modelButton().boundingBox()])
  expect(meterBox!.x + meterBox!.width).toBeLessThanOrEqual(pickerBox!.x) // to the left...
  expect(Math.abs(meterBox!.y + meterBox!.height / 2 - (pickerBox!.y + pickerBox!.height / 2))).toBeLessThan(14) // ...on the same row
  await shot(page(), '11-context-meter')
})

test('a reopened conversation still shows its context size', async () => {
  await page().reload()
  await expect(page().getByText('Code Puppy is ready')).toBeVisible(AGENT)
  await sidebar(page()).locator('li > button').first().click() // the conversation itself (not the New folder button above it)
  await expect(page().getByTestId('context-meter')).toHaveAttribute('data-known', 'true', AGENT)
})

const TOP_BAR = 48

/** The details panel must be fully on screen and clear of the top bar. */
async function expectOnScreen(details: Locator) {
  const [box, viewport] = await Promise.all([details.boundingBox(), page().evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))])
  expect(box!.y, 'slides under the top bar').toBeGreaterThanOrEqual(TOP_BAR)
  expect(box!.y + box!.height, 'falls off the bottom').toBeLessThanOrEqual(viewport.height)
  expect(box!.x, 'falls off the left').toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width, 'falls off the right').toBeLessThanOrEqual(viewport.width)
}

test('clicking the context meter says how much of the window is used', async () => {
  const meter = page().getByTestId('context-meter')
  const details = page().getByTestId('context-details')
  await expect(details).toBeHidden()
  await meter.click()
  await expect(details).toBeVisible()
  await expect(meter).toHaveAttribute('aria-expanded', 'true')

  // "X of Y tokens used", the percentage, and what is left: the same numbers the meter's own label gives.
  const label = (await meter.getAttribute('aria-label'))!
  const [, usedText, totalText, pct] = label.match(/about ([\d,]+) of ([\d,]+) tokens used \((\d+)%\)/)!
  const used = Number(usedText.replace(/,/g, ''))
  const total = Number(totalText.replace(/,/g, ''))
  expect(used).toBeGreaterThan(0)
  await expect(details).toContainText(/\d+(\.\d)?k of \d+k\s*tokens used/)
  await expect(details).toContainText(`${pct}% used`)
  await expect(details).toContainText(/about \d+(\.\d)?k left/)
  await expect(details).toContainText('An estimate')
  await expect(details.getByRole('progressbar', { name: 'Context window used' })).toHaveAttribute('aria-valuenow', pct)
  expect(total).toBeGreaterThan(used)
  await expectOnScreen(details)
  await shot(page(), '15-context-details')

  // Escape closes it and hands focus back to the meter.
  await page().keyboard.press('Escape')
  await expect(details).toBeHidden()
  await expect(meter).toBeFocused()
  await expect(meter).toHaveAttribute('aria-expanded', 'false')

  // Clicking elsewhere closes it too, and clicking the meter again toggles it.
  await meter.click()
  await expect(details).toBeVisible()
  await page().getByRole('log', { name: 'Conversation' }).click({ position: { x: 5, y: 5 } })
  await expect(details).toBeHidden()
  await meter.click()
  await meter.click()
  await expect(details).toBeHidden()
})

test('the model menu rings show your REAL quota, not a local guess', async () => {
  const quota = await page().evaluate(() => window.puppy.refreshQuota())
  expect(quota, 'quota unreadable: needs a network path to the Code Puppy backend').not.toBeNull()
  const { standard, large } = quota!
  const largeShown = standard.limit > 0 && standard.used >= standard.limit ? 100 : percent(large.used, large.limit)

  await modelButton().click()
  const menu = page().getByRole('listbox', { name: 'Model' })
  const rings = await menu.getByRole('img').evaluateAll((nodes) => nodes.map((node) => ({ label: node.getAttribute('aria-label') ?? '', text: node.textContent ?? '' })))

  const large_ = rings.filter((ring) => /large-model quota used|large models are unavailable/.test(ring.label))
  const standard_ = rings.filter((ring) => /standard quota used/.test(ring.label))
  const free = rings.filter((ring) => /free, it does not use your quota/.test(ring.label))
  expect(large_.length, 'some model counts against the large quota').toBeGreaterThan(0)
  expect(standard_.length, 'some model counts against the standard quota').toBeGreaterThan(0)
  for (const ring of large_) expect(ring.text).toBe(`${largeShown}%`)
  for (const ring of standard_) expect(ring.text).toBe(`${percent(standard.used, standard.limit)}%`)
  for (const ring of free) expect(ring.text).toBe('free')
  if (large.used > 0) expect(large_.every((ring) => ring.text === '0%'), 'rings must not read 0% while quota is used').toBe(false)

  await expect(page().getByTestId('quota-summary')).toHaveText(
    new RegExp(`Large ${percent(large.used, large.limit)}% · Others ${percent(standard.used, standard.limit)}% · resets in .+`),
  )

  // Rings form one clean column: the selected row's checkmark must not push its ring sideways.
  const boxes = await menu.getByRole('img').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect()).map(({ x, width }) => ({ x, width })))
  expect(new Set(boxes.map((box) => Math.round(box.x))).size).toBe(1)
  expect(boxes[0].width).toBeGreaterThanOrEqual(34)
  await shot(page(), '12-quota-rings')
  // The big models sit further down the list; look at them too, since they are the ones that run out first.
  await menu.getByRole('img', { name: /large-model quota used|large models are unavailable/ }).first().scrollIntoViewIfNeeded()
  await shot(page(), '12b-quota-rings-large-models')
  await page().keyboard.press('Escape')
})

test('settings shows the real quota buckets and when they reset', async () => {
  const quota = (await page().evaluate(() => window.puppy.getQuota()))!
  await page().getByRole('button', { name: 'Settings', exact: true }).click()
  const section = page().getByRole('region', { name: 'Quota' })
  await expect(section.getByRole('progressbar', { name: 'Large models' })).toHaveAttribute('aria-valuenow', String(percent(quota.large.used, quota.large.limit)))
  await expect(section.getByRole('progressbar', { name: 'All models' })).toHaveAttribute('aria-valuenow', String(percent(quota.standard.used, quota.standard.limit)))
  await expect(section.getByTestId('quota-reset')).toContainText(/Resets in .+/)
  await section.getByRole('button', { name: 'Refresh quota' }).click()
  await expect(section.getByRole('button', { name: 'Refresh quota' })).toBeEnabled(AGENT) // finished checking
  await shot(page(), '13-settings-quota')
  await page().getByRole('button', { name: 'Close settings' }).click()
  await page().getByRole('button', { name: 'Chat', exact: true }).click()
})

// The composer sits mid-window on the home screen, so a menu opening upward can run out of room
// and slide under the top bar. It must flip to open downward instead.
test('the model menu fits on screen on the home screen', async () => {
  await page().getByRole('button', { name: 'New chat' }).click()
  await modelButton().click()
  const popover = page().getByRole('listbox', { name: 'Model' }).locator('xpath=ancestor::div[contains(@class,"w-72")][1]')
  await expect(popover).toBeVisible()
  const [box, search, viewport] = await Promise.all([
    popover.boundingBox(),
    page().getByRole('textbox', { name: 'Search models' }).boundingBox(),
    page().evaluate(() => ({ height: window.innerHeight })),
  ])
  const TOP_BAR = 48
  expect(box!.y, 'menu slides under the top bar').toBeGreaterThanOrEqual(TOP_BAR)
  expect(box!.y + box!.height, 'menu falls off the bottom').toBeLessThanOrEqual(viewport.height)
  expect(search!.y, 'search box is clipped').toBeGreaterThanOrEqual(TOP_BAR)
  await shot(page(), '14-model-menu-home')
  await page().keyboard.press('Escape')
})

test('on the home screen the context details say it is not measured yet, and still fit', async () => {
  await page().getByRole('button', { name: 'New chat' }).click()
  await page().getByTestId('context-meter').click()
  const details = page().getByTestId('context-details')
  await expect(details).toContainText('Not measured yet')
  await expect(details).toContainText(/– of \d+k\s*tokens used/)
  await expectOnScreen(details)
  await shot(page(), '16-context-details-home')
  await page().keyboard.press('Escape')
})

/** "Resets in 1h 15m" -> 75, "Resets in 2h" -> 120, "Resets in 45m" -> 45. */
const minutesIn = (text: string) => {
  const [, hours, minutes] = text.match(/Resets in (?:(\d+)h)?\s*(?:(\d+)m)?/)!
  return Number(hours ?? 0) * 60 + Number(minutes ?? 0)
}

// Last in the file: it leaves the page's clock ten minutes ahead.
test('the reset countdown keeps ticking on screen without any refresh', async () => {
  const quota = (await page().evaluate(() => window.puppy.getQuota()))!
  test.skip(quota.resetsInSecs < 20 * 60, 'the reset is too close to watch a ten-minute tick')

  await page().clock.install()
  await page().getByRole('button', { name: 'Settings', exact: true }).click()
  const reset = page().getByTestId('quota-reset')
  const before = minutesIn((await reset.textContent())!)

  await page().clock.fastForward('10:00')
  await expect.poll(async () => before - minutesIn((await reset.textContent())!)).toBeGreaterThanOrEqual(9)
  expect(before - minutesIn((await reset.textContent())!)).toBeLessThanOrEqual(11)
})
