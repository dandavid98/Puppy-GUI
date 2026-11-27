import { readJson, writeJsonAtomic } from './jsonFile'

/** A Keychain-backed cipher in production (keychainCipher.ts); a stand-in in tests. */
export interface Cipher {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(encrypted: Buffer): string
}

type Stored = Record<string, Record<string, string>>

/**
 * The values catalog servers need (API keys, tokens, settings such as a database
 * path), kept apart from the server list and encrypted with a key the macOS
 * Keychain holds for Puppy. Read back only in the main process, when a chat
 * starts: never sent to the window, never written in the clear.
 */
export class McpVault {
  constructor(
    private readonly path: string,
    private readonly cipher: Cipher,
  ) {}

  set(serverId: string, values: Record<string, string>): void {
    if (!this.cipher.isEncryptionAvailable()) throw new Error('This Mac cannot store keys securely for Puppy right now, so the server was not added.')
    const sealed = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, this.cipher.encryptString(value).toString('base64')]))
    this.write({ ...this.read(), [serverId]: sealed })
  }

  /** Empty when there is nothing saved, or it can no longer be read (another Mac, a reset Keychain). */
  get(serverId: string): Record<string, string> {
    const sealed = this.read()[serverId]
    if (!sealed) return {}
    try {
      return Object.fromEntries(Object.entries(sealed).map(([name, value]) => [name, this.cipher.decryptString(Buffer.from(value, 'base64'))]))
    } catch {
      return {}
    }
  }

  delete(serverId: string): void {
    const { [serverId]: _gone, ...rest } = this.read()
    this.write(rest)
  }

  private read(): Stored {
    const saved = readJson<unknown>(this.path, {})
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? (saved as Stored) : {}
  }

  private write(stored: Stored): void {
    writeJsonAtomic(this.path, stored, 0o600) // encrypted anyway; readable by this user only as well
  }
}
