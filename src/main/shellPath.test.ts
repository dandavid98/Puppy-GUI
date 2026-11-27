import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loginShellPath, type Run } from './shellPath'

const FINDER = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', SHELL: '/bin/zsh' }

describe('loginShellPath', () => {
  it("puts the login shell's PATH first, keeping the current entries once, and ignores profile chatter", () => {
    let asked: string[] = []
    const run: Run = (shell, args) => {
      asked = [shell, ...args]
      return 'Welcome back!\n\nPUPPY_SHELL_PATH=/Users/me/.local/bin:/usr/bin:/bin\n'
    }
    expect(loginShellPath(FINDER, run)).toBe('/Users/me/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin')
    expect(asked.slice(0, 2)).toEqual(['/bin/zsh', '-ilc'])
  })

  it('falls back to the usual install locations when the shell fails or says nothing useful', () => {
    const failing: Run = () => {
      throw new Error('timed out')
    }
    for (const run of [failing, () => 'no marker here']) {
      const path = loginShellPath(FINDER, run)
      expect(path.startsWith(FINDER.PATH)).toBe(true)
      expect(path).toContain(join(homedir(), '.local', 'bin'))
      expect(path).toContain('/opt/homebrew/bin')
    }
  })

  it('finds node through the real login shell, starting from the PATH Finder gives an app', () => {
    const onPath = (tool: string, path: string) => path.split(':').some((dir) => existsSync(join(dir, tool)))
    expect(onPath('node', FINDER.PATH)).toBe(false)
    expect(onPath('node', loginShellPath(FINDER))).toBe(true)
  })
})
