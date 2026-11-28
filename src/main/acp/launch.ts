import { pythonNextTo } from '../codePuppyPython'

/**
 * Starting Code Puppy for ACP, with three things Code Puppy's ACP agent lacks.
 *
 * 1. Servers added in Puppy actually reaching the model.
 *
 * Code Puppy's ACP agent attaches the MCP servers a client passes in `session/new`
 * to `agent._mcp_servers`, but its agent builder takes toolsets only from Code
 * Puppy's global registry and overwrites that list, so the model never sees them.
 * This bootstrap keeps them and hands them back through `transform_mcp_toolsets`,
 * Code Puppy's own extension seam for adjusting an agent's toolsets, wrapped per
 * agent so classes that override it (Confluence) are covered too. Each server is
 * also wrapped so an unreachable one is left out instead of failing the chat
 * (Code Puppy shields its own servers the same way).
 *
 * 2. A permission level per chat (ACP `session/set_mode`: "ask", "standard", "full").
 *
 * Code Puppy asks before file changes and shell commands unless yolo mode is on,
 * a setting for the whole process and shared with the terminal, and its ACP agent
 * ignores `session/set_mode`. Here the yolo check answers per chat instead: "ask"
 * is yolo off, "full" is yolo on, and "standard" is Code Puppy exactly as the user
 * has set it up (a chat Puppy never sets is standard). The agent echoes the level
 * back, so Puppy can tell it took effect rather than assume. Nothing is written
 * to the user's config.
 *
 * 3. A model per chat (ACP `session/set_config_option` with the option id `puppy_session_model`).
 *
 * Code Puppy has one model per process, and every chat without one of its own follows it on
 * its next prompt, so changing the model in one chat changed it for all of them, and for every
 * new chat. An agent can carry its own model, though, and ignores the process one while it does.
 * This option sets that, for one chat, and says so in its answer (and writes nothing to the
 * user's config). The ordinary `model` option is untouched: it is still the default for chats
 * that have not chosen. An empty value gives a chat back to the default.
 *
 * Then it runs Code Puppy's
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

# What Puppy may ask a session to be (ACP session/set_mode). "standard" is Code Puppy as the user has set it up.
PERMISSION_MODES = ("ask", "standard", "full")
ACP_STATE_MODULES = ("code_puppy_core_plugins.acp.state", "code_puppy.plugins.acp.state")
ACP_AGENT_MODULES = ("code_puppy_core_plugins.acp.agent", "code_puppy.plugins.acp.agent")
ACP_SESSION_CONFIG_MODULES = ("code_puppy_core_plugins.acp.session_config", "code_puppy.plugins.acp.session_config")
# The option id Puppy uses to give one chat its own model (the ordinary "model" option sets the process-wide default).
SESSION_MODEL_OPTION = "puppy_session_model"

def first_module(names):
    for name in names:
        try:
            return importlib.import_module(name)
        except ImportError:
            pass
    raise ImportError("Code Puppy's ACP plugin was not found")

def install_permission_levels():
    import code_puppy.config as config

    original = config.get_yolo_mode
    if hasattr(original, "puppy_levels"):
        return  # already installed
    state = first_module(ACP_STATE_MODULES)
    agent_class = first_module(ACP_AGENT_MODULES).CodePuppyAgent
    levels = {}  # session id -> "ask" | "full"; a session not in here is "standard"

    def get_yolo_mode():
        # Code Puppy asks before file changes and shell commands unless yolo mode is on. Which run is this? The one
        # whose session the current task belongs to (a ContextVar, so two chats running at once never mix up).
        level = levels.get(state.get_active_session_id())
        if level == "ask":
            return False
        if level == "full":
            return True
        return original()

    get_yolo_mode.puppy_levels = levels
    set_mode = agent_class.set_session_mode

    async def set_session_mode(self, mode_id, session_id, **kwargs):
        response = await set_mode(self, mode_id, session_id, **kwargs)
        if mode_id not in PERMISSION_MODES:
            return response
        if mode_id == "standard":
            levels.pop(session_id, None)
        else:
            levels[session_id] = mode_id
        # Say so, so Puppy can tell a Code Puppy that applied the level from one that quietly ignored it.
        meta = {**(getattr(response, "field_meta", None) or {}), "puppy": {"permission": mode_id}}
        return type(response).model_validate({"_meta": meta})

    config.get_yolo_mode = get_yolo_mode
    for module in list(sys.modules.values()):  # modules that already imported the original by name
        try:
            if getattr(module, "get_yolo_mode", None) is original:
                module.get_yolo_mode = get_yolo_mode
        except Exception:
            pass
    agent_class.set_session_mode = set_session_mode

try:
    install_permission_levels()
except Exception as error:
    print(f"Puppy: permission levels are unavailable ({error!r})", file=sys.stderr)

def install_session_models():
    agent_class = first_module(ACP_AGENT_MODULES).CodePuppyAgent
    original = agent_class.set_config_option
    if getattr(original, "puppy_session_models", False):
        return  # already installed
    session_config = first_module(ACP_SESSION_CONFIG_MODULES)

    async def set_config_option(self, config_id, session_id, value, **kwargs):
        if config_id != SESSION_MODEL_OPTION:
            return await original(self, config_id, session_id, value, **kwargs)
        from acp.schema import SetSessionConfigOptionResponse
        from code_puppy.command_line.model_picker_completion import load_model_names

        session = self._sessions.get(session_id)
        if session is None:
            raise ValueError(f"No such session: {session_id}")
        model = str(value) if value else None  # empty: back to following the process-wide model
        if model is not None and model not in (load_model_names() or []):
            raise ValueError(f"No such model: {model}")
        # The agent's own model comes before the process-wide one, and each run builds from it.
        session.agent.set_runtime_model_name_override(model)
        meta = {"puppy": {"model": model}}
        return SetSessionConfigOptionResponse.model_validate({"configOptions": session_config.config_options() or None, "_meta": meta})

    set_config_option.puppy_session_models = True
    agent_class.set_config_option = set_config_option

try:
    install_session_models()
except Exception as error:
    print(f"Puppy: a model per chat is unavailable ({error!r})", file=sys.stderr)
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
