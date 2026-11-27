import type { McpServer } from '@agentclientprotocol/sdk'
import type { McpCatalogEntry, McpField } from '@shared/api'
import { runPython, runScript, type Runner } from './codePuppyPython'
import { correctCatalogSpec, parseSpec, strings, text, type ServerSpec } from './mcpSpec'

/**
 * Code Puppy's own catalog of MCP servers (its built-in list plus Walmart's
 * additions), read through its own Python. Many entries point at npm packages
 * that were never published or have been withdrawn, so each package is looked
 * up first: missing ones are left out, and entries needing a tool this Mac lacks
 * (docker, kubectl) say so. Nothing here writes Code Puppy's configuration.
 */

export interface CatalogTemplate {
  entry: McpCatalogEntry
  /** Code Puppy's own server name, used for its tool names. */
  name: string
  /** With placeholders: `${setting}` for settings and `$KEY` for keys. */
  spec: ServerSpec
}

export interface Catalog {
  list(): Promise<CatalogTemplate[]>
  /** Starts the server, lists its tools, stops it. Resolves to the tool count; rejects with the reason it failed. */
  check(server: McpServer): Promise<number>
}

const LIST_SCRIPT = `
import concurrent.futures, shutil, urllib.error, urllib.request
from code_puppy.mcp_.server_registry_catalog import MCP_SERVER_REGISTRY
templates = list(MCP_SERVER_REGISTRY)
try:
    from code_puppy.plugins.walmart_specific.register_callbacks import get_walmart_mcp_servers
    templates += get_walmart_mcp_servers()  # Walmart's additions, as Code Puppy lists them
except Exception:
    pass
registry = sys.argv[1]

def npm_package(t):
    if t.config.get("command") != "npx":
        return None
    return next((arg for arg in t.config.get("args", []) if not arg.startswith("-")), None)

def package_state(name):
    if not name:
        return "ok"
    # Plain JSON: Walmart's mirror answers npm's abbreviated-metadata type with 406.
    request = urllib.request.Request(registry + name.replace("/", "%2f"), headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            info = json.load(response)
        latest = info.get("dist-tags", {}).get("latest")
        return "deprecated" if info.get("versions", {}).get(latest, {}).get("deprecated") else "ok"
    except urllib.error.HTTPError as error:
        return "missing" if error.code == 404 else "unknown"
    except Exception:
        return "unknown"  # cannot tell: the check when adding will

with concurrent.futures.ThreadPoolExecutor(16) as pool:
    states = list(pool.map(lambda t: package_state(npm_package(t)), templates))

def entry(t, state):
    requirements = t.get_requirements()
    config = t.to_server_config()  # Code Puppy's own conversion, placeholders kept
    tools = list(dict.fromkeys(requirements.required_tools + ([config["command"]] if config.get("command") else [])))
    return {
        "id": t.id, "name": config.get("name") or t.name, "displayName": t.display_name, "description": t.description or "",
        "category": t.category or "Other", "tags": list(t.tags or []), "verified": bool(t.verified), "type": t.type,
        "config": {key: config[key] for key in ("command", "args", "env", "url", "headers") if config.get(key) is not None},
        "settings": [{"name": a.get("name"), "label": a.get("prompt") or a.get("name"), "default": str(a.get("default") or ""),
                      "required": bool(a.get("required"))} for a in requirements.command_line_args if a.get("name")],
        "keys": t.get_environment_vars(),
        "missing": [tool for tool in tools if not shutil.which(tool)],
        "deprecated": state == "deprecated",
    }

emit([entry(t, state) for t, state in zip(templates, states) if state != "missing"])
`

/** The spec arrives on stdin: it carries the user's keys. The server's own error output explains a failure best. */
const CHECK_SCRIPT = `
import asyncio, os, tempfile
from pathlib import Path
from fastmcp import Client
from fastmcp.client.transports import SSETransport, StdioTransport, StreamableHttpTransport
spec = json.load(sys.stdin)
pairs = lambda items: {item["name"]: item["value"] for item in items or []}
log = Path(tempfile.mkstemp(prefix="puppy-mcp-check-")[1])

def transport():
    if spec.get("command"):
        return StdioTransport(command=spec["command"], args=spec.get("args") or [], env=pairs(spec.get("env")), log_file=log)
    kind = SSETransport if spec.get("type") == "sse" else StreamableHttpTransport
    return kind(spec["url"], headers=pairs(spec.get("headers")))

async def tools():
    async with Client(transport(), timeout=60) as client:
        return len(await client.list_tools())

try:
    emit({"tools": asyncio.run(asyncio.wait_for(tools(), float(sys.argv[1])))})
except BaseException as error:
    said = log.read_text(errors="replace").strip()
    emit({"error": said[-800:] if said else (str(error) or type(error).__name__)})
finally:
    log.unlink(missing_ok=True)
`

/** The first start downloads the package: about ten seconds here, longer on a slow network. */
const CHECK_SECONDS = 150

function toFields(raw: Record<string, unknown>): McpField[] {
  const settings = (Array.isArray(raw.settings) ? raw.settings : []).map((setting: Record<string, unknown>) => ({
    name: text(setting.name),
    label: text(setting.label) || text(setting.name),
    default: text(setting.default),
    required: setting.required === true,
    secret: false,
  }))
  const keys = strings(raw.keys).map((name) => ({ name, label: name, default: '', required: true, secret: true }))
  const seen = new Set<string>()
  return [...settings, ...keys].filter((field) => field.name && !seen.has(field.name) && seen.add(field.name))
}

export function toTemplates(emitted: unknown): CatalogTemplate[] {
  if (!Array.isArray(emitted)) throw new Error("Could not read Code Puppy's MCP catalog.")
  return emitted
    .filter((raw): raw is Record<string, unknown> => !!raw && typeof raw === 'object' && typeof raw.id === 'string')
    .flatMap((raw) => {
      const config = raw.config && typeof raw.config === 'object' ? (raw.config as Record<string, unknown>) : {}
      const spec = parseSpec(raw.type, config)
      if (!spec) return []
      const missing = strings(raw.missing)
      const entry: McpCatalogEntry = {
        id: text(raw.id),
        displayName: text(raw.displayName) || text(raw.id),
        description: text(raw.description),
        category: text(raw.category) || 'Other',
        tags: strings(raw.tags),
        verified: raw.verified === true,
        fields: toFields(raw),
        unavailable: missing.length ? `Needs ${missing.join(', ')}` : null,
        deprecated: raw.deprecated === true,
      }
      return [{ entry, name: text(raw.name) || entry.id, spec: correctCatalogSpec(entry.id, spec) }]
    })
    .sort((a, b) => a.entry.displayName.localeCompare(b.entry.displayName))
}

export function toToolCount(emitted: unknown): number {
  const raw = (emitted ?? {}) as { tools?: unknown; error?: unknown }
  if (typeof raw.tools === 'number') return raw.tools
  throw new Error(typeof raw.error === 'string' && raw.error ? raw.error : 'The server did not start.')
}

export class CodePuppyCatalog implements Catalog {
  constructor(
    private readonly python: () => string | null,
    private readonly registry: string,
    private readonly run: Runner = runPython,
  ) {}

  private interpreter(): string {
    const python = this.python()
    if (!python) throw new Error('Code Puppy is not installed where Puppy can find it.')
    return python
  }

  async list(): Promise<CatalogTemplate[]> {
    return toTemplates(await runScript(this.interpreter(), LIST_SCRIPT, { args: [this.registry], timeoutMs: 90_000 }, this.run))
  }

  async check(server: McpServer): Promise<number> {
    const options = { args: [String(CHECK_SECONDS)], timeoutMs: (CHECK_SECONDS + 20) * 1000, input: JSON.stringify(server) }
    return toToolCount(await runScript(this.interpreter(), CHECK_SCRIPT, options, this.run))
  }
}
