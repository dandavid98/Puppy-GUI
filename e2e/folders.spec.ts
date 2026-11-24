import { existsSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, sendAndWait, test, useApp } from './fixtures'

const { app, page } = useApp()

const newProject = (name: string) => realpathSync(mkdtempSync(join(tmpdir(), `puppy-e2e-${name}-`)))

/** Point the (native) folder dialog at `folder`, then click the folder button. */
async function chooseFolder(folder: string, button: string | RegExp) {
  await app().evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] })
  }, folder)
  await page().getByRole('button', { name: button }).click()
}

const whereItRan = (folder: string) => readFileSync(join(folder, 'where.txt'), 'utf8').trim()
const SHELL_PWD = 'Run this shell command and say only done: pwd > where.txt'

// Code Puppy's shell tool runs wherever the PROCESS was started, so one shared process ran every
// command in the wrong place (and files made that way could not be previewed). Each project now
// gets its own process, started in its own folder.
test('a shell command runs in the project folder, not wherever the app was started', async () => {
  const project = newProject('shell')
  await page().getByRole('button', { name: 'Code', exact: true }).click()
  await chooseFolder(project, 'Choose folder')
  await sendAndWait(page(), SHELL_PWD)
  expect(existsSync(join(project, 'where.txt'))).toBe(true)
  expect(whereItRan(project)).toBe(project)
})

test('two projects each get their own Code Puppy, started in their own folder', async () => {
  const first = newProject('first')
  const second = newProject('second')

  await page().getByRole('button', { name: 'New code session' }).click()
  await chooseFolder(first, /^Project folder:/)
  await sendAndWait(page(), SHELL_PWD)

  await page().getByRole('button', { name: 'New code session' }).click()
  await chooseFolder(second, /^Project folder:/)
  await sendAndWait(page(), SHELL_PWD)

  expect(whereItRan(first)).toBe(first)
  expect(whereItRan(second)).toBe(second)
})

test('chats keep working alongside project processes, and sessions from every process are listed', async () => {
  await page().getByRole('button', { name: 'Chat', exact: true }).click()
  await page().getByRole('button', { name: 'New chat' }).click()
  await sendAndWait(page(), 'Reply with exactly one word: pong')

  const sessions = await page().evaluate(() => window.puppy.listSessions())
  expect(sessions.filter((session) => session.kind === 'code').length).toBeGreaterThanOrEqual(3)
  expect(sessions.filter((session) => session.kind === 'chat').length).toBeGreaterThanOrEqual(1)
  expect(new Set(sessions.filter((session) => session.kind === 'code').map((session) => session.cwd)).size).toBeGreaterThanOrEqual(3)
})
