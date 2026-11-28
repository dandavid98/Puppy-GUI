import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AGENT, expect, sendAndWait, shot, test, useApp } from './fixtures'

const { app, page } = useApp()
const panel = () => page().getByRole('complementary', { name: 'Preview' })
const inPanel = () => page().frameLocator('iframe[title^="Preview of"]')

let project = ''

test('a page the agent touched can be previewed in the side panel', async () => {
  project = mkdtempSync(join(tmpdir(), 'puppy-e2e-site-'))
  writeFileSync(join(project, 'report.html'), '<!doctype html><h1>Quarterly pup report</h1><script>document.title = "ran"</script>')
  await app().evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] })
  }, project)

  await page().getByRole('button', { name: 'Code', exact: true }).click()
  await page().getByRole('button', { name: 'Choose folder' }).click()
  await sendAndWait(page(), 'Read report.html and say only: done')

  // Reading a page is looking, not making: it must not pop open by itself.
  await expect(panel()).toBeHidden()
  await page().getByRole('button', { name: 'Preview report.html' }).click()
  await expect(panel()).toBeVisible()
  await expect(inPanel().getByRole('heading', { name: 'Quarterly pup report' })).toBeVisible()
  // Squeezed by the panel, the composer must shrink its contents, not spill them.
  const send = await page().getByRole('button', { name: 'Send message' }).boundingBox()
  const box = await page().getByLabel('Message Code Puppy').locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]').boundingBox()
  expect(send!.x + send!.width).toBeLessThanOrEqual(box!.x + box!.width)
  // ...and the folder name gives way before the model name does: you must always see which model you are on.
  // Measured on the text itself, not scrollWidth: that is a rounded integer, so a name clipped by a fraction of
  // a pixel ties with its box and passes, while Chrome still replaces its last characters with an ellipsis.
  const modelName = page().getByRole('button', { name: /^Model:/ }).locator('span.truncate')
  const clippedBy = await modelName.evaluate((el) => {
    const text = document.createRange()
    text.selectNodeContents(el)
    return text.getBoundingClientRect().width - el.getBoundingClientRect().width // the box fits its text, so this is 0 unless it is squeezed
  })
  expect(clippedBy).toBeLessThanOrEqual(0)
  await shot(page(), '09-preview')

  await panel().getByRole('button', { name: 'Close preview' }).click()
  await expect(panel()).toBeHidden()
})

test('a page the agent writes opens in the panel by itself', async () => {
  await page().getByRole('button', { name: 'New code session' }).click()
  await sendAndWait(page(), 'Use your file-creation tool (not the shell) to create a file named pup.html in the current folder containing exactly: <h1>Auto pup</h1> Then reply with only the word: done')
  await expect(panel()).toBeVisible(AGENT)
  await expect(inPanel().getByRole('heading', { name: 'Auto pup' })).toBeVisible()
  await expect(panel().getByRole('button', { name: 'Reload preview' })).toBeVisible()
  await panel().getByRole('button', { name: 'Close preview' }).click()
})

test('a local server the agent mentions opens in the panel once it answers', async () => {
  // Like Django, this server forbids framing: the app has to get past that for localhost.
  const server: Server = createServer((_request, response) => {
    response.setHeader('X-Frame-Options', 'DENY')
    response.setHeader('Content-Security-Policy', "frame-ancestors 'none'")
    response.setHeader('Content-Type', 'text/html')
    response.end('<!doctype html><title>dev</title><h1>Hello from localhost</h1><p id="js">waiting</p><script>document.getElementById("js").textContent = "scripts ran"</script>')
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as { port: number }
  try {
    await page().getByRole('button', { name: 'New code session' }).click()
    await sendAndWait(page(), `Reply with exactly this sentence and nothing else: Your app is running at http://localhost:${port}/`)
    await expect(panel()).toBeVisible(AGENT)
    await expect(panel().getByRole('heading', { name: `localhost:${port}` })).toBeVisible()
    await expect(inPanel().getByRole('heading', { name: 'Hello from localhost' })).toBeVisible()
    await expect(inPanel().getByText('scripts ran')).toBeVisible() // scripts and the server's own origin work
    await shot(page(), '14-localhost-preview')

    // Close it, then click the address in the reply: it opens in the panel, not an external browser.
    await panel().getByRole('button', { name: 'Close preview' }).click()
    await expect(panel()).toBeHidden()
    await page().getByRole('log', { name: 'Conversation' }).getByRole('link', { name: `http://localhost:${port}/` }).click()
    await expect(inPanel().getByRole('heading', { name: 'Hello from localhost' })).toBeVisible()
  } finally {
    server.close()
  }
})

test('switched off in Settings, nothing opens by itself, but the Preview button remains', async () => {
  await page().getByRole('button', { name: 'Settings' }).click()
  await page().getByRole('switch', { name: 'Open previews automatically' }).click()
  await expect(page().getByRole('switch', { name: 'Open previews automatically' })).toHaveAttribute('aria-checked', 'false')

  await page().getByRole('button', { name: 'Code', exact: true }).click()
  await sendAndWait(page(), 'Use your file-creation tool (not the shell) to create a file named pup2.html in the current folder containing exactly: <h1>Quiet pup</h1> Then reply with only the word: done')
  await expect(page().getByRole('button', { name: 'Preview pup2.html' })).toBeVisible(AGENT)
  await expect(panel()).toBeHidden()
  expect(existsSync(join(project, 'pup2.html'))).toBe(true)
})

test('the browser-opening guard refuses scripts and files outside the project', async () => {
  const attempt = (path: string) => page().evaluate((p) => window.puppy.openInBrowser(p).then(() => 'opened', (e: Error) => e.message), path)
  expect(await attempt('/bin/ls')).toMatch(/cannot be opened/)
  expect(await attempt('/etc/hosts.html')).toMatch(/cannot be opened/)
  expect(await attempt('/Applications/Utilities/Terminal.app')).toMatch(/cannot be opened/)
  // Web addresses: only plain-http loopback ones.
  expect(await attempt('http://example.com/')).toMatch(/cannot be opened/)
  expect(await attempt('https://localhost:3000/')).toMatch(/cannot be opened/)
  expect(await attempt('file:///etc/passwd')).toMatch(/cannot be opened/)
  expect(await attempt('http://localhost@evil.com/')).toMatch(/cannot be opened/)
  // And the server probe never reaches beyond this machine.
  expect(await page().evaluate(() => window.puppy.waitForServer('http://example.com:80/'))).toBe(false)
})

test('html from a message is saved inside the app folder for previewing', async () => {
  const target = await page().evaluate(() => window.puppy.previewHtml('<h1>Hi pup</h1>'))
  expect(target.url).toMatch(/^puppy-preview:\/\/file\/.*\/previews\/[0-9a-f]{16}\.html$/)
})
