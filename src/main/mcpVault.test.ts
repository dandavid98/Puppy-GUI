import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { McpVault, type Cipher } from './mcpVault'

const cipher: Cipher = {
  isEncryptionAvailable: () => true,
  encryptString: (plain) => Buffer.from(`sealed:${[...plain].reverse().join('')}`),
  decryptString: (sealed) => [...sealed.toString().replace(/^sealed:/, '')].reverse().join(''),
}
const vaultFile = () => join(mkdtempSync(join(tmpdir(), 'puppy-vault-')), 'mcp-secrets.json')

describe('McpVault', () => {
  it('keeps values per server, never in the clear, in a file only this user can read', () => {
    const path = vaultFile()
    const vault = new McpVault(path, cipher)
    vault.set('catalog:github', { GITHUB_TOKEN: 'ghp_plain-text-key' })
    vault.set('catalog:slack', { SLACK_TOKEN: 'xoxb-other' })
    expect(new McpVault(path, cipher).get('catalog:github')).toEqual({ GITHUB_TOKEN: 'ghp_plain-text-key' })
    expect(readFileSync(path, 'utf8')).not.toContain('ghp_plain-text-key')
    expect(statSync(path).mode & 0o777).toBe(0o600)
    vault.delete('catalog:github')
    expect(vault.get('catalog:github')).toEqual({})
    expect(vault.get('catalog:slack')).toEqual({ SLACK_TOKEN: 'xoxb-other' })
  })

  it('refuses to store anything when the Keychain cannot encrypt', () => {
    const path = vaultFile()
    const vault = new McpVault(path, { ...cipher, isEncryptionAvailable: () => false })
    expect(() => vault.set('catalog:github', { GITHUB_TOKEN: 'k' })).toThrow(/cannot store keys securely/)
  })

  it('reads as empty when the file is junk or the values can no longer be decrypted', () => {
    const path = vaultFile()
    writeFileSync(path, '[1, 2')
    expect(new McpVault(path, cipher).get('x')).toEqual({})
    new McpVault(path, cipher).set('x', { KEY: 'v' })
    const resetKeychain = new McpVault(path, { ...cipher, decryptString: () => { throw new Error('bad key') } })
    expect(resetKeychain.get('x')).toEqual({})
  })
})
