/** What a JWT (the login token most web APIs hand out) says about itself, without checking its signature: only used to show, never to trust. */
export interface TokenClaims {
  /** Milliseconds since the epoch; null if the token names none. */
  expiresAtMs: number | null
  account: string | null
}

const ACCOUNT_CLAIMS = ['email', 'upn', 'username', 'preferred_username', 'sub']

/** Null when the text is not a JWT at all (a GitHub token, say). */
export function readToken(token: string): TokenClaims | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  let claims: Record<string, unknown>
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>
  } catch {
    return null
  }
  if (!claims || typeof claims !== 'object') return null
  const exp = typeof claims.exp === 'number' && Number.isFinite(claims.exp) ? claims.exp * 1000 : null
  const account = ACCOUNT_CLAIMS.map((name) => claims[name]).find((value): value is string => typeof value === 'string' && value.includes('@')) ?? null
  return { expiresAtMs: exp, account }
}
