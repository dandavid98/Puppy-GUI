import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { net, protocol, shell, type Session } from 'electron'
import { isLocalUrl, isPreviewable, pathFromPreviewUrl, PREVIEW_SCHEME } from '@shared/preview'
import { withoutFramingBlocks } from './localServer'
import { isInside } from './pathGuard'

/** Must run before app "ready": lets the scheme behave like a real origin (relative URLs, fetch). */
export function registerPreviewScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: PREVIEW_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ])
}

/**
 * Serve preview files, but only from folders the app is actually working in.
 * The renderer never gets file access; it just points an iframe at a URL.
 */
export function handlePreviewProtocol(allowedRoots: () => Iterable<string>): void {
  protocol.handle(PREVIEW_SCHEME, (request) => {
    const path = pathFromPreviewUrl(request.url)
    if (!isInside(path, allowedRoots())) return new Response('Not allowed', { status: 403 })
    return net.fetch(pathToFileURL(path).toString())
  })
}

/** HTML from a code block becomes a real file so its relative/CDN assets load normally. */
export function writePreviewHtml(dir: string, html: string): string {
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${createHash('sha256').update(html).digest('hex').slice(0, 16)}.html`)
  writeFileSync(path, html)
  return path
}

/** Lets the preview panel frame local dev servers that forbid framing (see withoutFramingBlocks). */
export function allowLocalFraming(session: Session): void {
  session.webRequest.onHeadersReceived({ urls: ['http://localhost/*', 'http://127.0.0.1/*', 'http://[::1]/*'] }, (details, callback) => {
    const framed = details.resourceType === 'subFrame'
    callback({ responseHeaders: framed ? withoutFramingBlocks(details.responseHeaders ?? {}) : details.responseHeaders })
  })
}

/**
 * Open a preview in the browser (Chrome when installed, else the system
 * default): either a localhost URL, or a previewable file inside an allowed
 * folder. "open" would happily run a script or an .app, and shell.openExternal
 * any URL scheme, so the renderer must never be able to pick those.
 */
export async function openInBrowser(target: string, roots: Iterable<string>): Promise<void> {
  const isUrl = isLocalUrl(target)
  if (!isUrl && (!isPreviewable(target) || !isInside(target, roots))) throw new Error('That file cannot be opened from Puppy.')
  if (process.platform === 'darwin') {
    const opened = await new Promise<boolean>((done) => execFile('open', ['-a', 'Google Chrome', target], (error) => done(!error)))
    if (opened) return
  }
  if (isUrl) return shell.openExternal(target)
  const failure = await shell.openPath(target)
  if (failure) throw new Error(failure)
}
