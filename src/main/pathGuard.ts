import { resolve, sep } from 'node:path'

/** True only for paths inside one of the allowed folders (no "../" escapes). */
export function isInside(path: string, roots: Iterable<string>): boolean {
  const target = resolve(path)
  for (const root of roots) {
    const base = resolve(root)
    if (target === base || target.startsWith(base + sep)) return true
  }
  return false
}
