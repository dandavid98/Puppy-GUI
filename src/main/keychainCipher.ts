import { execFileSync } from 'node:child_process'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { Cipher } from './mcpVault'

const SECURITY = '/usr/bin/security'
const ACCOUNT = 'mcp-keys'
/** `security`'s exit status when there is no such item. */
const NOT_FOUND = 44
const IV_BYTES = 12
const TAG_BYTES = 16

/** Where the master key lives. */
export interface KeyStore {
  read(): string | null
  create(key: string): void
}

/**
 * The login Keychain, through Apple's own `security` tool. The item belongs to
 * that tool, whose signature never changes, so Puppy updates (each one signed
 * anew) cause no Keychain prompts, unlike Electron's safeStorage. The key goes
 * in on stdin, never in arguments, where `ps` would show it.
 */
export function keychainStore(service: string): KeyStore {
  return {
    read() {
      try {
        const args = ['find-generic-password', '-s', service, '-a', ACCOUNT, '-w']
        return execFileSync(SECURITY, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000 }).trim() || null
      } catch (error) {
        if ((error as { status?: number }).status === NOT_FOUND) return null
        throw error // a locked or unreachable Keychain
      }
    },
    create(key) {
      execFileSync(SECURITY, ['-i'], { input: `add-generic-password -s "${service}" -a ${ACCOUNT} -w "${key}"\n`, stdio: ['pipe', 'ignore', 'ignore'], timeout: 10_000 })
    },
  }
}

/** AES-256-GCM, with a random master key made on first use and kept in `store`. */
export class KeychainCipher implements Cipher {
  private key: Buffer | null = null

  constructor(private readonly store: KeyStore) {}

  isEncryptionAvailable(): boolean {
    try {
      this.masterKey()
      return true
    } catch {
      return false
    }
  }

  encryptString(plain: string): Buffer {
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv('aes-256-gcm', this.masterKey(), iv)
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), body])
  }

  /** Throws when the data was changed, or sealed with another key. */
  decryptString(sealed: Buffer): string {
    const decipher = createDecipheriv('aes-256-gcm', this.masterKey(), sealed.subarray(0, IV_BYTES))
    decipher.setAuthTag(sealed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
    return Buffer.concat([decipher.update(sealed.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8')
  }

  private masterKey(): Buffer {
    if (this.key) return this.key
    if (!this.store.read()) this.store.create(randomBytes(32).toString('base64'))
    const key = Buffer.from(this.store.read() ?? '', 'base64') // read back: the Keychain is the one source of truth
    if (key.length !== 32) throw new Error('No usable key in the Keychain.')
    return (this.key = key)
  }
}
