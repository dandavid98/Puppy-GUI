import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

export { expect, test }

/** For anything that waits on code-puppy itself (boot, a model turn). */
export const AGENT = { timeout: 180_000 }

export const shot = (page: Page, name: string) => page.screenshot({ path: join('test-results', `${name}.png`) })

/**
 * The installed app is tested with the environment Finder gives it: no shell profile, so no SSL_CERT_FILE,
 * proxies or PATH. (Inheriting ours once hid a bug where quota only worked when launched from a terminal.)
 */
const finderEnv = (): Record<string, string> => ({
  HOME: process.env.HOME ?? '',
  USER: process.env.USER ?? '',
  TMPDIR: process.env.TMPDIR ?? '/tmp',
  PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
})

/**
 * Launch the built app against a fresh, throwaway profile (so tests never see
 * real chats) and wait until code-puppy is connected. One app per spec file:
 * booting code-puppy is the slow part.
 */
export function useApp(extraEnv: Record<string, string> = {}): { app: () => ElectronApplication; page: () => Page } {
  let app: ElectronApplication
  let page: Page

  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    // PUPPY_APP=/path/to/Puppy.app/Contents/MacOS/Puppy tests the installed app instead of the dev build.
    const target = process.env.PUPPY_APP ? { executablePath: process.env.PUPPY_APP } : { args: ['.'] }
    app = await electron.launch({
      ...target,
      colorScheme: null, // Playwright pins "light" by default, which would mask the app's own theme switching
      env: { ...(process.env.PUPPY_APP ? finderEnv() : process.env), PUPPY_DESKTOP_USER_DATA: mkdtempSync(join(tmpdir(), 'puppy-e2e-')), ...extraEnv },
    })
    page = await app.firstWindow()
    await expect(page.getByText('Code Puppy is ready')).toBeVisible(AGENT)
    await page.getByLabel('Message Code Puppy').fill('') // the window may have caught stray keystrokes
  })
  test.afterAll(async () => {
    // Leave no test sessions behind in code-puppy's shared session store.
    await page
      ?.evaluate(async () => {
        for (const session of await window.puppy.listSessions()) await window.puppy.deleteSession(session.sessionId)
      })
      .catch(() => undefined)
    await app?.close()
  })
  return { app: () => app, page: () => page }
}

/** Send a message from whichever composer is on screen and wait for the turn to end. */
export async function sendAndWait(page: Page, text: string): Promise<void> {
  await page.getByLabel('Message Code Puppy').fill(text)
  await page.keyboard.press('Enter')
  const log = page.getByRole('log', { name: 'Conversation' })
  await expect(log.getByText(text)).toBeVisible(AGENT)
  await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible(AGENT)
}

export const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Recent conversations' })
