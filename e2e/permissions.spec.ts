import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AGENT, expect, shot, test, useApp } from './fixtures'

const project = mkdtempSync(join(tmpdir(), 'puppy-e2e-permissions-'))
const { app, page } = useApp()

const picker = () => page().getByRole('button', { name: /^Permissions:/ })
const choose = async (label: string) => {
  await picker().click()
  await page().getByRole('option', { name: new RegExp(label) }).click()
}
/** Sends without waiting for the turn to end: with "ask", the turn stops at the question. */
const send = async (text: string) => {
  await page().getByLabel('Message Code Puppy').fill(text)
  await page().keyboard.press('Enter')
}
const approval = () => page().getByRole('alertdialog')

test('the control sits beside the folder, starts on Standard, and offers the three levels in plain words', async () => {
  await app().evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] })
  }, project)
  await page().getByRole('button', { name: 'Code', exact: true }).click()
  await page().getByRole('button', { name: 'Choose folder' }).click()
  await expect(page().getByRole('button', { name: /^Project folder:/ })).toBeVisible()

  await expect(picker()).toHaveAccessibleName('Permissions: Standard')
  const folder = await page().getByRole('button', { name: /^Project folder:/ }).boundingBox()
  const level = await picker().boundingBox()
  expect(level!.x).toBeGreaterThan(folder!.x + folder!.width - 1) // after the folder, on the same row
  expect(Math.abs(level!.y - folder!.y)).toBeLessThan(12)
  // Both are small chips under the message box, not inside it: the box itself holds only attach and send.
  const box = await page().getByLabel('Message Code Puppy').locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]').boundingBox()
  expect(level!.y).toBeGreaterThanOrEqual(box!.y + box!.height)
  expect(folder!.y).toBeGreaterThanOrEqual(box!.y + box!.height)
  // Attach opens that row, just before the folder...
  const attach = await page().getByRole('button', { name: 'Attach files' }).boundingBox()
  expect(attach!.x + attach!.width).toBeLessThanOrEqual(folder!.x)
  expect(Math.abs(attach!.y + attach!.height / 2 - (folder!.y + folder!.height / 2))).toBeLessThan(4)
  // ...and send is on the same line as the text, at its end: the box is a single row.
  const [text, send] = [await page().getByLabel('Message Code Puppy').boundingBox(), await page().getByRole('button', { name: 'Send message' }).boundingBox()]
  expect(send!.x).toBeGreaterThanOrEqual(text!.x + text!.width)
  expect(send!.y).toBeGreaterThanOrEqual(text!.y)
  expect(send!.y + send!.height).toBeLessThanOrEqual(text!.y + text!.height)

  await picker().click()
  const options = page().getByRole('listbox', { name: 'Permissions' }).getByRole('option')
  await expect(options).toHaveText([/Ask every time.*Asks before every change or command/, /Standard.*Follows Code Puppy's own settings/, /Full access.*Never asks/])
  await shot(page(), 'permissions-menu')
  await page().keyboard.press('Escape')

  await choose('Full access')
  await expect(picker()).toHaveAccessibleName('Permissions: Full access')
  await choose('Ask every time') // what the next test uses
  await expect(picker()).toHaveAccessibleName('Permissions: Ask every time')
})

test('ask every time: a file change waits for you, and rejecting it means it does not happen', async () => {
  await send('Create a file named ask.txt containing exactly the word ASK. Do nothing else.')
  await expect(approval()).toBeVisible(AGENT)
  await expect(approval()).toContainText('Code Puppy wants permission')
  await shot(page(), 'permissions-asked')
  expect(existsSync(join(project, 'ask.txt'))).toBe(false) // it is waiting, not done

  await approval().getByRole('button', { name: 'Reject' }).click()
  await expect(page().getByRole('button', { name: 'Send message' })).toBeVisible(AGENT)
  expect(existsSync(join(project, 'ask.txt'))).toBe(false)
  await expect(picker()).toHaveAccessibleName('Permissions: Ask every time') // the chat kept its level
})

test('ask every time: allowing it lets the change through', async () => {
  await send('Please try again: create a file named ask.txt containing exactly the word ASK.')
  await expect(approval()).toBeVisible(AGENT)
  await approval().getByRole('button', { name: 'Allow' }).click()
  await expect(page().getByRole('button', { name: 'Send message' })).toBeVisible(AGENT)
  expect(readFileSync(join(project, 'ask.txt'), 'utf8').trim()).toBe('ASK')
})

test('full access, switched on in the middle of a chat, goes ahead without asking', async () => {
  await choose('Full access')
  await expect(picker()).toHaveAccessibleName('Permissions: Full access')
  await send('Create a file named full.txt containing exactly the word FULL. Do nothing else.')
  await expect(page().getByRole('button', { name: 'Send message' })).toBeVisible(AGENT) // the turn ended with nobody asked
  await expect(approval()).toHaveCount(0)
  expect(readFileSync(join(project, 'full.txt'), 'utf8').trim()).toBe('FULL')
})

test('a chat keeps its level when switched away from and back, and when loaded afresh by Code Puppy', async () => {
  await page().getByRole('button', { name: 'New code session' }).click()
  await expect(picker()).toHaveAccessibleName('Permissions: Standard') // a new chat starts standard again
  await page().getByRole('navigation', { name: 'Recent conversations' }).locator('li').first().getByRole('button').first().click()
  await expect(picker()).toHaveAccessibleName('Permissions: Full access')

  // What happens after a restart: Puppy asks Code Puppy to load the saved chat, and puts its level back.
  const restored = await page().evaluate(async () => {
    const [saved] = await window.puppy.listSessions()
    return (await window.puppy.loadSession(saved.sessionId, saved.cwd)).permission
  })
  expect(restored).toBe('full')
})
