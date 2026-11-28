import { execFile } from 'node:child_process'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pythonNextTo } from '../codePuppyPython'
import { locateCodePuppy } from '../locateCodePuppy'
import { ACP_BOOTSTRAP, ACP_PATCH, acpLaunch } from './launch'

function binDir(withPython: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'puppy-launch-'))
  for (const name of withPython ? ['code-puppy', 'python3'] : ['code-puppy']) {
    writeFileSync(join(dir, name), '#!/bin/sh\n')
    chmodSync(join(dir, name), 0o755)
  }
  return dir
}

describe('acpLaunch', () => {
  it("goes through the bootstrap with code-puppy's own Python, which then runs Code Puppy's entry point", () => {
    const dir = binDir(true)
    expect(acpLaunch(join(dir, 'code-puppy'))).toEqual({ command: join(dir, 'python3'), args: ['-c', ACP_BOOTSTRAP, '--acp'] })
    expect(ACP_BOOTSTRAP.startsWith(ACP_PATCH)).toBe(true)
    expect(ACP_BOOTSTRAP).toContain('sys.exit(main_entry())')
  })

  it('falls back to the launcher itself when there is no Python beside it', () => {
    const dir = binDir(false)
    expect(acpLaunch(join(dir, 'code-puppy'))).toEqual({ command: join(dir, 'code-puppy'), args: ['--acp'] })
  })
})

/** Run the patch, then `check`, inside code-puppy's own Python. Resolves to what it printed. */
function inCodePuppy(check: string): Promise<{ stdout: string; stderr: string }> {
  const python = pythonNextTo(locateCodePuppy())!
  return new Promise((done, fail) =>
    execFile(python, ['-c', ACP_PATCH + check], { cwd: homedir(), timeout: 60_000 }, (error, stdout, stderr) => (error ? fail(error) : done({ stdout, stderr }))),
  )
}

// Real Code Puppy: PUPPY_LIVE_AGENTS=1 npx vitest run src/main/acp/launch.test.ts
describe.skipIf(!process.env.PUPPY_LIVE_AGENTS)('the patch, inside the real Code Puppy', () => {
  // The ACP plugin Code Puppy really loads (a same-named leftover copy also ships inside code_puppy).
  const ATTACH = `
from types import SimpleNamespace as Spec
from code_puppy.agents.agent_manager import load_agent
from code_puppy_core_plugins.acp import mcp_config
print("PATCHED", patched)

def attached(agent_name, *names):
    agent = load_agent(agent_name)
    mcp_config.attach(agent, [Spec(name=name, url="http://127.0.0.1:1/mcp", type="http", headers=[]) for name in names])
    return agent
`

  it('hands servers attached over ACP to the agent builder, once, for every agent class', async () => {
    const { stdout, stderr } = await inCodePuppy(`${ATTACH}
plain = attached("code-puppy", "one")
print("PLAIN", len(plain.transform_mcp_toolsets([])))
mcp_config.attach(plain, [Spec(name="two", url="http://127.0.0.1:1/mcp", type="http", headers=[])])
first = plain.transform_mcp_toolsets([])
print("AGAIN", len(first), len(plain.transform_mcp_toolsets(first)))
print("CONFLUENCE", len(attached("confluence-search", "one").transform_mcp_toolsets([])))

import asyncio
dead = attached("code-puppy", "dead").transform_mcp_toolsets([])[0]
async def enter_dead():
    async with dead:
        return await dead.get_tools(None)
print("DEAD", asyncio.run(enter_dead()))
`)
    expect(stderr).not.toContain('unavailable')
    expect(stdout).toContain("'code_puppy_core_plugins.acp.mcp_config'")
    expect(stdout).toContain('PLAIN 1')
    expect(stdout).toContain('AGAIN 2 2') // both servers, and never doubled when already there
    expect(stdout).toContain('CONFLUENCE 1') // an agent class with its own transform
    expect(stdout).toContain('DEAD {}') // nothing listening: no tools, no error
    expect(stderr).toContain('is unreachable, so its tools are left out')
  }, 90_000)

  // Run in-process, as the ACP server does: a session's run is a ContextVar, so `begin_run` is all it takes to be "in" a chat.
  const LEVELS = `
import asyncio
from types import SimpleNamespace
import code_puppy.config as config
from code_puppy_core_plugins.acp import state
from code_puppy_core_plugins.acp.agent import CodePuppyAgent
from code_puppy_core_plugins.file_permission_handler import register_callbacks as files

me = SimpleNamespace()
async def set_mode(mode, session):
    response = await CodePuppyAgent.set_session_mode(me, mode, session)
    return (response.field_meta or {}).get("puppy", {}).get("permission")

def yolo_in(session):
    state.begin_run(session)
    try:
        return (config.get_yolo_mode(), files.get_yolo_mode())  # the function, and a module that imported it by name
    finally:
        state.end_run()
`

  it('answers the yolo question per chat: ask is off, full is on, standard is whatever the user set', async () => {
    const { stdout, stderr } = await inCodePuppy(`${LEVELS}
config.set_cli_yolo_override(True)  # a user with yolo on
print("ECHO", asyncio.run(set_mode("ask", "a")), asyncio.run(set_mode("full", "f")), asyncio.run(set_mode("standard", "s")))
print("ON", yolo_in("a"), yolo_in("f"), yolo_in("s"), yolo_in("never-set"), "outside", config.get_yolo_mode())
config.set_cli_yolo_override(False)  # a user with yolo off
print("OFF", yolo_in("a"), yolo_in("f"), yolo_in("s"), yolo_in("never-set"), "outside", config.get_yolo_mode())
asyncio.run(set_mode("standard", "a"))  # back to standard forgets it
config.set_cli_yolo_override(True)
print("BACK", yolo_in("a"))
print("OTHER", asyncio.run(set_mode("plan", "a")))  # a mode that is not ours is left alone
`)
    expect(stderr).not.toContain('unavailable')
    expect(stdout).toContain('ECHO ask full standard')
    expect(stdout).toContain('ON (False, False) (True, True) (True, True) (True, True) outside True')
    expect(stdout).toContain('OFF (False, False) (True, True) (False, False) (False, False) outside False')
    expect(stdout).toContain('BACK (True, True)')
    expect(stdout).toContain('OTHER None')
  }, 90_000)

  it('keeps two chats running at once apart, and is safe to install twice', async () => {
    const { stdout } = await inCodePuppy(`${LEVELS}
asyncio.run(set_mode("ask", "strict"))
asyncio.run(set_mode("full", "loose"))
install_permission_levels()  # again: must not lose what was set

async def run(session):
    state.begin_run(session)
    await asyncio.sleep(0.01)  # the other run starts in between
    answer = config.get_yolo_mode()
    await asyncio.sleep(0.01)
    return answer

async def both():
    return await asyncio.gather(*(asyncio.ensure_future(run(s)) for s in ("strict", "loose", "strict", "loose")))

print("BOTH", asyncio.run(both()))
`)
    expect(stdout).toContain('BOTH [False, True, False, True]')
  }, 90_000)
})
