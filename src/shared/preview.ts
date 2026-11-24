/** Files shown in the preview panel are served by main over this private scheme. */
export const PREVIEW_SCHEME = 'puppy-preview'
const PREVIEW_ORIGIN = `${PREVIEW_SCHEME}://file`

export const PREVIEWABLE_EXTENSIONS = ['html', 'htm', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp'] as const

export interface PreviewTarget {
  kind: 'file' | 'web'
  title: string
  /** What the iframe loads. */
  url: string
  /** The file on disk, or for web targets the URL itself: what "Open in browser" opens. */
  location: string
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
// Dev servers often print 0.0.0.0, which browsers cannot visit: treat it as localhost.
const URL_IN_TEXT = /http:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d{2,5}[^\s)<>"'`\\\]]*/gi
const TRAILING_PUNCTUATION = /[.,;:!?]+$/

/** http only, a loopback host, no credentials: the only pages the preview panel will load over the network. */
export function isLocalUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname) && !url.username && !url.password
  } catch {
    return false
  }
}

/** The URL as a browsable local address (0.0.0.0 becomes localhost), or null if it is not one. */
export function asLocalUrl(value: string): string | null {
  const normalised = value.replace(/^(http:\/\/)0\.0\.0\.0(?=[:/]|$)/i, '$1localhost')
  return isLocalUrl(normalised) ? normalised : null
}

/** Local http URLs mentioned in text, normalised and de-duplicated, in order of appearance. */
export function localUrlsIn(text: string): string[] {
  const found = (text.match(URL_IN_TEXT) ?? []).flatMap((raw) => asLocalUrl(raw.replace(TRAILING_PUNCTUATION, '')) ?? [])
  return [...new Set(found)]
}

export function webTarget(url: string): PreviewTarget {
  return { kind: 'web', title: new URL(url).host, url, location: url }
}

export function isPreviewable(path: string): boolean {
  const extension = path.split('.').pop()?.toLowerCase() ?? ''
  return (PREVIEWABLE_EXTENSIONS as readonly string[]).includes(extension)
}

/** "/Users/me/my report.html" -> "puppy-preview://file/Users/me/my%20report.html" */
export function previewUrl(absolutePath: string): string {
  return PREVIEW_ORIGIN + absolutePath.split('/').map(encodeURIComponent).join('/')
}

/** Inverse of previewUrl; relative asset URLs inside a page resolve naturally. */
export function pathFromPreviewUrl(url: string): string {
  return decodeURIComponent(new URL(url).pathname)
}

export function previewTarget(absolutePath: string): PreviewTarget {
  return { kind: 'file', title: absolutePath.split('/').pop() ?? absolutePath, url: previewUrl(absolutePath), location: absolutePath }
}
