import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { realpathSync } from 'node:fs'
import { AGENT, expect, sendAndWait, shot, test, useApp } from './fixtures'

const { page } = useApp()

/** The agent a terminal would get right now: run from this test process, so not a child of Puppy. */
function terminalAgent(): Promise<string> {
  const python = join(dirname(realpathSync(join(homedir(), '.code-puppy-venv/bin/code-puppy'))), 'python3')
  const script = 'from code_puppy.agents.agent_manager import get_current_agent_name as current; print("AGENT", current())'
  return new Promise((done, fail) =>
    execFile(python, ['-c', script], { timeout: 30_000 }, (error, stdout) => (error ? fail(error) : done(stdout.match(/^AGENT (\S+)/m)?.[1] ?? ''))),
  )
}

test('the Agents page lists Code Puppy\'s agents with descriptions, and searches them', async () => {
  await page().getByRole('button', { name: 'Agents', exact: true }).click()
  await expect(page().getByRole('heading', { name: 'Agents', level: 1 })).toBeVisible()
  const agents = page().getByRole('list', { name: 'Agents' })
  await expect(agents.getByRole('listitem').nth(5)).toBeVisible(AGENT)
  await page().getByLabel('Search agents').fill('quality assurance kitten')
  await expect(agents.getByRole('listitem')).toHaveCount(1)
  await expect(agents.getByText(/browser automation/i)).toBeVisible()
  await shot(page(), 'agents-page')
})

test('"Ask for this agent" opens a new chat with the request started, ready to finish', async () => {
  await page().getByRole('button', { name: /^Ask for Quality Assurance Kitten/ }).click()
  const box = page().getByLabel('Message Code Puppy')
  await expect(box).toHaveValue(/^Use the Quality Assurance Kitten.* agent \(qa-kitten\) to $/)
  await page().keyboard.type('check the login page') // the caret waits at the end
  await expect(box).toHaveValue(/agent \(qa-kitten\) to check the login page$/)
  await box.fill('')
})

test('a default agent chosen in Puppy runs new chats, and the terminal keeps its own', async () => {
  const before = await terminalAgent()
  await page().getByRole('button', { name: 'Agents', exact: true }).click()
  await page().getByRole('button', { name: /^Default agent/ }).click()
  await page().getByRole('option', { name: /^Quality Assurance Kitten/ }).click()
  await expect(page().getByText(/New chats now start with Quality Assurance Kitten/)).toBeVisible(AGENT)
  await expect(page().getByText('Code Puppy is ready')).toBeVisible(AGENT)

  await page().getByRole('button', { name: 'New chat' }).click()
  await sendAndWait(page(), 'In a few words: what is your name?')
  await expect(page().getByRole('log', { name: 'Conversation' }).getByText(/Kitten/i).last()).toBeVisible()
  expect(await terminalAgent()).toBe(before)
})
