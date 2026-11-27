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
})
