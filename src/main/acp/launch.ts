import { pythonNextTo } from '../codePuppyPython'

/**
 * Starting Code Puppy for ACP, with servers added in Puppy actually reaching the model.
 *
 * Code Puppy's ACP agent attaches the MCP servers a client passes in `session/new`
 * to `agent._mcp_servers`, but its agent builder takes toolsets only from Code
 * Puppy's global registry and overwrites that list, so the model never sees them.
 * This bootstrap keeps them and hands them back through `transform_mcp_toolsets`,
 * Code Puppy's own extension seam for adjusting an agent's toolsets, wrapped per
 * agent so classes that override it (Confluence) are covered too. Each server is
 * also wrapped so an unreachable one is left out instead of failing the chat
 * (Code Puppy shields its own servers the same way). Then it runs Code Puppy's
 * entry point exactly as the `code-puppy` launcher does.
 *
 * Only Puppy's processes run this: the terminal, its config and its servers are
 * untouched. If Code Puppy's internals change, the patch is skipped (logged) and
 * Code Puppy starts as usual; if Code Puppy fixes this itself, nothing is doubled.
 */
export const ACP_PATCH = `
import importlib, sys

# Where Code Puppy's ACP plugin lives: the core-plugins package today, inside code_puppy before that.
ACP_CONFIG_MODULES = ("code_puppy_core_plugins.acp.mcp_config", "code_puppy.plugins.acp.mcp_config")

def install_client_mcp_servers():
    from dataclasses import dataclass
    from pydantic_ai.toolsets import WrapperToolset

    @dataclass
    class SkipIfUnreachable(WrapperToolset):
        """A server added in Puppy: when it cannot be reached it offers no tools, instead of failing the chat."""
        up: bool = False

        async def __aenter__(self):
            try:
                await self.wrapped.__aenter__()
                self.up = True
            except Exception as error:
                print(f"Puppy: MCP server {self.wrapped.label} is unreachable, so its tools are left out ({error!r})", file=sys.stderr)
            return self

        async def __aexit__(self, *args):
            if not self.up:
                return None
            self.up = False
            return await self.wrapped.__aexit__(*args)

        async def get_instructions(self, ctx):
            return await self.wrapped.get_instructions(ctx) if self.up else None

        async def get_tools(self, ctx):
            return await self.wrapped.get_tools(ctx) if self.up else {}

    def keep(mcp_config):
        attach = mcp_config.attach

        def attach_and_keep(agent, specs, *args, **kwargs):
            before = list(getattr(agent, "_mcp_servers", None) or [])
            attach(agent, specs, *args, **kwargs)
            added = [t for t in (getattr(agent, "_mcp_servers", None) or []) if all(t is not b for b in before)]
            if not added:
                return
            agent._puppy_client_toolsets = list(getattr(agent, "_puppy_client_toolsets", [])) + [SkipIfUnreachable(t) for t in added]
            if "transform_mcp_toolsets" in vars(agent):
                return  # this agent is already wrapped
            own = agent.transform_mcp_toolsets

            def transform(toolsets):
                result = own(toolsets)
                # Leave out any Code Puppy already passes on itself (should it fix this upstream), wrapped or not.
                return [*result, *(t for t in agent._puppy_client_toolsets if all(t is not r and t.wrapped is not r for r in result))]

            agent.transform_mcp_toolsets = transform

        mcp_config.attach = attach_and_keep

    patched = []
    for name in ACP_CONFIG_MODULES:
        try:
            keep(importlib.import_module(name))
            patched.append(name)
        except ImportError:
            pass
    if not patched:
        raise ImportError("Code Puppy's ACP plugin was not found")
    return patched

try:
    patched = install_client_mcp_servers()
except Exception as error:
    patched = []
    print(f"Puppy: MCP servers added in Puppy are unavailable ({error!r})", file=sys.stderr)
`

export const ACP_BOOTSTRAP = `${ACP_PATCH}
from code_puppy.main import main_entry
sys.exit(main_entry())
`

export interface Launch {
  command: string
  args: string[]
}

/** Through the bootstrap when code-puppy's Python sits next to its launcher; otherwise the launcher itself. */
export function acpLaunch(codePuppyBinary: string): Launch {
  const python = pythonNextTo(codePuppyBinary)
  return python ? { command: python, args: ['-c', ACP_BOOTSTRAP, '--acp'] } : { command: codePuppyBinary, args: ['--acp'] }
}
