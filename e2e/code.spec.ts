import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, sendAndWait, shot, test, useApp } from './fixtures'

const { app, page } = useApp()

test('code: picks a folder and shows tool calls', async () => {
  const project = mkdtempSync(join(tmpdir(), 'puppy-e2e-project-'))
  writeFileSync(join(project, 'hello.txt'), 'hello from the e2e test\n')
  // Replace the native folder dialog, which a test cannot click.
  await app().evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] })
  }, project)

  await page().getByRole('button', { name: 'Code', exact: true }).click()
  await expect(page().getByRole('heading', { name: 'What are we building?' })).toBeVisible()
  await page().getByRole('button', { name: 'Choose folder' }).click()
  await expect(page().getByRole('button', { name: /puppy-e2e-project-/ })).toBeVisible()

  await sendAndWait(page(), 'Read hello.txt and tell me what it says. Be brief.')
  const log = page().getByRole('log', { name: 'Conversation' })
  await expect(log.locator('details').first()).toBeVisible() // at least one tool call card
  await expect(log.locator('.prose').getByText(/hello from the e2e test/i)).toBeVisible()
  await log.locator('details summary').first().click()
  await shot(page(), '04-code-tool-expanded')
})
