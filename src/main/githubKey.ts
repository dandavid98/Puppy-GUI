/** What GitHub says about a token. */
export type KeyCheck =
  | { status: 'accepted'; login: string; expiresAtMs: number | null }
  | { status: 'rejected' }
  | { status: 'unreachable' }

export type FetchLike = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{
  status: number
  headers: { get(name: string): string | null }
  json(): Promise<unknown>
}>

/** GitHub writes "2026-12-01 10:00:00 UTC" (or "... -0500"): not a format `Date` reads on its own. */
export function parseGithubExpiry(header: string | null): number | null {
  const match = header && /^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d) (UTC|[+-]\d{4})$/.exec(header.trim())
  if (!match) return null
  const [, date, time, zone] = match
  const ms = Date.parse(`${date}T${time}${zone === 'UTC' ? 'Z' : `${zone.slice(0, 3)}:${zone.slice(3)}`}`)
  return Number.isNaN(ms) ? null : ms
}

/** Asks github.com who the token belongs to. Read-only, and the token goes nowhere else. */
export async function checkGithubKey(token: string, fetcher: FetchLike = fetch as unknown as FetchLike): Promise<KeyCheck> {
  try {
    const response = await fetcher('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Puppy', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (response.status === 401 || response.status === 403) return { status: 'rejected' }
    if (response.status !== 200) return { status: 'unreachable' }
    const body = (await response.json()) as { login?: unknown }
    return typeof body.login === 'string'
      ? { status: 'accepted', login: body.login, expiresAtMs: parseGithubExpiry(response.headers.get('github-authentication-token-expiration')) }
      : { status: 'unreachable' }
  } catch {
    return { status: 'unreachable' }
  }
}
