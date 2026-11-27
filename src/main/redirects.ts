import { allowedUrl } from './mcpSpec'

export type Fetch = (url: string, init: { redirect: 'manual'; signal: AbortSignal }) => Promise<{ status: number; headers: { get(name: string): string | null } }>

const REDIRECTS = [301, 302, 307, 308]
const MAX_HOPS = 3

/**
 * Where a server really lives. Code Puppy's chat client does not follow
 * redirects, and some servers answer `/mcp` with a redirect to `/mcp/`, so such
 * a server would silently offer no tools. Asked once, when the server is added,
 * with no credentials sent. Only same-origin redirects to an allowed URL are
 * followed; anything else (or any failure) keeps the URL as it was.
 */
export async function resolveRedirects(url: string, fetcher: Fetch = fetch): Promise<string> {
  let current = url
  try {
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const response = await fetcher(current, { redirect: 'manual', signal: AbortSignal.timeout(8_000) })
      const location = REDIRECTS.includes(response.status) ? response.headers.get('location') : null
      if (!location) break
      const next = new URL(location, current)
      if (next.origin !== new URL(current).origin || !allowedUrl(next.href)) break
      current = next.href
    }
  } catch {
    // unreachable right now: the URL stays as listed
  }
  return current
}
