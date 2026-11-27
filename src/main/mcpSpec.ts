import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { McpServer } from '@agentclientprotocol/sdk'

/**
 * How Puppy starts one MCP server. Saved to disk as a template: wherever a key,
 * token or setting goes there is a placeholder (`$NAME` or `${name}`, as Code
 * Puppy writes them), filled in only in memory when a chat starts.
 */
export type ServerSpec =
  | { type: 'http' | 'sse'; url: string; headers: Record<string, string> }
  | { type: 'stdio'; command: string; args: string[]; env: Record<string, string> }

/** The marketplace sign-in, which code-puppy's own server configs refer to by this name. */
export const TOKEN_VARIABLE = 'PUPPY_MARKETPLACE_TOKEN'

/** Walmart's mirrors: the public npm and PyPI registries are not reachable from its network. */
export const WALMART_NPM = 'https://npm.ci.artifacts.walmart.com/artifactory/api/npm/npme-npm/'
const WALMART_PYPI = 'https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple'

/** HTTPS, or plain HTTP on this Mac (local development servers). */
export function allowedUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'https:' || (protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(hostname))
  } catch {
    return false
  }
}

export const text = (value: unknown): string => (typeof value === 'string' ? value : '')
export const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])
export const record = (value: unknown): Record<string, string> =>
  value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item)])) : {}

/**
 * Mistakes in Code Puppy's catalog, put right here. The GitHub entry hands the
 * key over as GITHUB_TOKEN, but the package reads GITHUB_PERSONAL_ACCESS_TOKEN
 * and so ran without it (and the start-up check cannot tell). Each fix adds an
 * environment variable that points at the key the user types. Applied when the
 * catalog is read and again when saved servers are, so ones added before a fix
 * get it too.
 */
const CATALOG_CORRECTIONS: Record<string, Record<string, string>> = {
  github: { GITHUB_PERSONAL_ACCESS_TOKEN: '$GITHUB_TOKEN' },
}

export function correctCatalogSpec(catalogId: string, spec: ServerSpec): ServerSpec {
  const fix = CATALOG_CORRECTIONS[catalogId]
  return spec.type === 'stdio' && fix ? { ...spec, env: { ...spec.env, ...fix } } : spec
}

/** A spec from untrusted JSON (Code Puppy's output, or a hand-edited file): null unless it is complete and safe. */
export function parseSpec(type: unknown, raw: Record<string, unknown>): ServerSpec | null {
  if (type === 'stdio') return text(raw.command) ? { type, command: text(raw.command), args: strings(raw.args), env: record(raw.env) } : null
  if ((type === 'http' || type === 'sse') && allowedUrl(text(raw.url))) return { type, url: text(raw.url), headers: record(raw.headers) }
  return null
}

const escape = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const placeholder = (name: string) => new RegExp(`\\$\\{${escape(name)}\\}|\\$${escape(name)}(?![A-Za-z0-9_])`, 'g')

/** Every place a value can go. */
const texts = (spec: ServerSpec): string[] =>
  spec.type === 'stdio' ? [...spec.args, ...Object.values(spec.env)] : [spec.url, ...Object.values(spec.headers)]

export const mentions = (spec: ServerSpec, name: string): boolean => texts(spec).some((text) => placeholder(name).test(text))

export function fill(text: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((filled, [name, value]) => filled.replace(placeholder(name), () => value), text)
}

const fillAll = (record: Record<string, string>, values: Record<string, string>) =>
  Object.fromEntries(Object.entries(record).map(([key, value]) => [key, fill(value, values)]))

const configured = (file: string, pattern: RegExp) => (existsSync(file) ? pattern.exec(readFileSync(file, 'utf8')) : null)

/**
 * The npm registry the user set up themselves, if any. npm's default is not a
 * choice (npm even exports it to every script it runs) and is unreachable from
 * Walmart's network, so it does not count.
 */
function ownNpmRegistry(env: NodeJS.ProcessEnv, home: string): string | null {
  const registry = env.npm_config_registry || env.NPM_CONFIG_REGISTRY || configured(join(home, '.npmrc'), /^\s*registry\s*=\s*(\S+)/m)?.[1]
  return registry && !/^https?:\/\/registry\.npmjs\.org\/?$/.test(registry) ? registry : null
}

/** The registry npx will install from: the user's own, otherwise Walmart's mirror. */
export function npmRegistry(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  const registry = ownNpmRegistry(env, home) ?? WALMART_NPM
  return registry.endsWith('/') ? registry : `${registry}/`
}

/**
 * Registry settings for npx and uvx. Always explicit: MCP servers inherit only
 * PATH, HOME and a few more, never the user's npm or uv variables. Config files
 * (~/.npmrc, uv.toml) are read by the tools themselves, through HOME.
 */
export function packageMirrors(env: NodeJS.ProcessEnv = process.env, home = homedir()): Record<string, string> {
  const mirrors: Record<string, string> = { npm_config_registry: npmRegistry(env, home) }
  const uvIndex = env.UV_DEFAULT_INDEX || env.UV_INDEX_URL
  if (uvIndex) mirrors.UV_DEFAULT_INDEX = uvIndex
  else if (!configured(join(home, '.config', 'uv', 'uv.toml'), /index/)) {
    mirrors.UV_DEFAULT_INDEX = WALMART_PYPI
    mirrors.UV_INSECURE_HOST = new URL(WALMART_PYPI).hostname // Walmart's documented setting for its PyPI mirror
  }
  return mirrors
}

/**
 * The ACP spec Code Puppy starts the server from, with `values` filled in.
 * Values a local server needs but its template never mentions (some catalog
 * entries just expect them in the environment) are passed as environment variables.
 */
export function toAcpSpec(spec: ServerSpec, name: string, values: Record<string, string>, mirrors: Record<string, string> = {}): McpServer {
  const pairs = (record: Record<string, string>) => Object.entries(record).map(([key, value]) => ({ name: key, value }))
  if (spec.type !== 'stdio') return { type: spec.type, name, url: fill(spec.url, values), headers: pairs(fillAll(spec.headers, values)) }
  const unmentioned = Object.fromEntries(Object.entries(values).filter(([key]) => !mentions(spec, key)))
  return { name, command: spec.command, args: spec.args.map((arg) => fill(arg, values)), env: pairs({ ...mirrors, ...unmentioned, ...fillAll(spec.env, values) }) }
}
