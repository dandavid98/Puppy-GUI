/** The `NAME=value` lines of a `.env` file: `export` prefixes, quotes and trailing comments handled, the last of a repeated name wins. */
export function parseEnv(text: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (!match) continue
    const [, name, raw] = match
    const quoted = /^(["'])(.*)\1/.exec(raw)
    values[name] = quoted ? quoted[2] : raw.replace(/\s+#.*$/, '')
  }
  return values
}
