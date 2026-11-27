import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { KeychainCipher, keychainStore, type KeyStore } from './keychainCipher'

function memoryStore(initial: string | null = null) {
  const calls = { create: 0 }
  let saved = initial
  const store: KeyStore = {
    read: () => saved,
    create: (key) => {
      calls.create++
      saved = key
    },
  }
  return { store, calls }
}

describe('KeychainCipher', () => {
  it('makes a key once, then round-trips text with a fresh IV each time', () => {
    const { store, calls } = memoryStore()
    const cipher = new KeychainCipher(store)
    const first = cipher.encryptString('ghp_secret')
    const second = cipher.encryptString('ghp_secret')
    expect(first.equals(second)).toBe(false)
    expect(first.toString('latin1')).not.toContain('ghp_secret')
    expect(new KeychainCipher(store).decryptString(first)).toBe('ghp_secret') // a restart reads the same key
    expect(calls.create).toBe(1)
  })

  it('refuses tampered data, and data sealed with another key', () => {
    const cipher = new KeychainCipher(memoryStore().store)
    const sealed = cipher.encryptString('value')
    sealed[sealed.length - 1] ^= 1
    expect(() => cipher.decryptString(sealed)).toThrow()
    expect(() => new KeychainCipher(memoryStore().store).decryptString(cipher.encryptString('value'))).toThrow()
  })

  it('reports encryption as unavailable when the Keychain cannot be read', () => {
    const locked: KeyStore = {
      read: () => {
        throw new Error('locked')
      },
      create: () => undefined,
    }
    expect(new KeychainCipher(locked).isEncryptionAvailable()).toBe(false)
    expect(new KeychainCipher(memoryStore('too-short').store).isEncryptionAvailable()).toBe(false)
  })
})

// The real login Keychain, with a throwaway item: PUPPY_LIVE_AGENTS=1 npx vitest run src/main/keychainCipher.test.ts
describe.skipIf(!process.env.PUPPY_LIVE_AGENTS || process.platform !== 'darwin')('the real Keychain', () => {
  it('stores the key once, without prompting, and reads it back after a restart', () => {
    const service = `Puppy test ${process.pid}`
    try {
      const store = keychainStore(service)
      expect(store.read()).toBeNull()
      const sealed = new KeychainCipher(store).encryptString('live-value')
      expect(new KeychainCipher(keychainStore(service)).decryptString(sealed)).toBe('live-value')
    } finally {
      execFileSync('/usr/bin/security', ['delete-generic-password', '-s', service, '-a', 'mcp-keys'], { stdio: 'ignore' })
    }
  })
})
