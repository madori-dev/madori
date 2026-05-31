import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '@/lib/auth/password'

describe('password hashing', () => {
  describe('hashPassword', () => {
    it('returns a string in scrypt:salt:hash format', async () => {
      const hash = await hashPassword('mypassword')
      const parts = hash.split(':')
      expect(parts).toHaveLength(3)
      expect(parts[0]).toBe('scrypt')
      // salt is 32 bytes = 64 hex chars
      expect(parts[1]).toHaveLength(64)
      // hash is 64 bytes = 128 hex chars
      expect(parts[2]).toHaveLength(128)
    })

    it('produces different hashes for the same password (random salt)', async () => {
      const hash1 = await hashPassword('samepassword')
      const hash2 = await hashPassword('samepassword')
      expect(hash1).not.toBe(hash2)
    })
  })

  describe('verifyPassword', () => {
    it('returns true for the correct password', async () => {
      const hash = await hashPassword('correctpassword')
      const result = await verifyPassword('correctpassword', hash)
      expect(result).toBe(true)
    })

    it('returns false for an incorrect password', async () => {
      const hash = await hashPassword('correctpassword')
      const result = await verifyPassword('wrongpassword', hash)
      expect(result).toBe(false)
    })

    it('returns false for a malformed hash string', async () => {
      const result = await verifyPassword('password', 'not-a-valid-hash')
      expect(result).toBe(false)
    })

    it('returns false for an empty hash string', async () => {
      const result = await verifyPassword('password', '')
      expect(result).toBe(false)
    })

    it('returns false for a hash with wrong prefix', async () => {
      const result = await verifyPassword('password', 'argon2:abc:def')
      expect(result).toBe(false)
    })
  })
})
