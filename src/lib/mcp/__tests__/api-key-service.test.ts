import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { McpApiKeyService } from '../api-key-service'
import type { McpPermission } from '../auth'

describe('McpApiKeyService', () => {
  let service: McpApiKeyService
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'mcp-keys-'))
    service = new McpApiKeyService(tempDir)
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  const testPermissions: McpPermission[] = [
    { resource: 'entries', actions: ['read', 'write'] },
    { resource: 'assets', actions: ['read'] },
  ]

  describe('createKey', () => {
    it('returns a raw key with mdk_ prefix and the stored record', async () => {
      const { key, record } = await service.createKey('Test Key', testPermissions)

      expect(key).toMatch(/^mdk_/)
      expect(key.length).toBeGreaterThan(10)
      expect(record.id).toBeDefined()
      expect(record.label).toBe('Test Key')
      expect(record.permissions).toEqual(testPermissions)
      expect(record.createdAt).toBeDefined()
      expect(record.keyHash).toMatch(/^scrypt:/)
      expect(record.revokedAt).toBeUndefined()
    })
  })

  describe('validateKey', () => {
    it('returns the record for a valid key', async () => {
      const { key, record } = await service.createKey('Validate Test', testPermissions)

      const result = await service.validateKey(key)

      expect(result).not.toBeNull()
      expect(result!.id).toBe(record.id)
      expect(result!.label).toBe('Validate Test')
    })

    it('returns null for an invalid key', async () => {
      await service.createKey('Some Key', testPermissions)

      const result = await service.validateKey('mdk_invalidkey123')

      expect(result).toBeNull()
    })
  })

  describe('revokeKey', () => {
    it('sets revokedAt timestamp on the key', async () => {
      const { record } = await service.createKey('Revoke Test', testPermissions)

      await service.revokeKey(record.id)

      const keys = await service.listKeys()
      const revoked = keys.find((k) => k.id === record.id)
      expect(revoked?.revokedAt).toBeDefined()
    })

    it('throws for non-existent key', async () => {
      await expect(service.revokeKey('nonexistent')).rejects.toThrow('API key not found')
    })
  })

  describe('deleteKey', () => {
    it('removes the key file', async () => {
      const { record } = await service.createKey('Delete Test', testPermissions)

      await service.deleteKey(record.id)

      const keys = await service.listKeys()
      expect(keys.find((k) => k.id === record.id)).toBeUndefined()
    })

    it('throws for non-existent key', async () => {
      await expect(service.deleteKey('nonexistent')).rejects.toThrow('API key not found')
    })
  })

  describe('listKeys', () => {
    it('returns all stored keys', async () => {
      await service.createKey('Key 1', testPermissions)
      await service.createKey('Key 2', testPermissions)
      await service.createKey('Key 3', testPermissions)

      const keys = await service.listKeys()

      expect(keys).toHaveLength(3)
      expect(keys.map((k) => k.label).sort()).toEqual(['Key 1', 'Key 2', 'Key 3'])
    })

    it('returns empty array when no keys exist', async () => {
      const keys = await service.listKeys()
      expect(keys).toEqual([])
    })
  })

  describe('recordUsage', () => {
    it('updates lastUsedAt timestamp', async () => {
      const { record } = await service.createKey('Usage Test', testPermissions)
      expect(record.lastUsedAt).toBeUndefined()

      await service.recordUsage(record.id)

      const keys = await service.listKeys()
      const updated = keys.find((k) => k.id === record.id)
      expect(updated?.lastUsedAt).toBeDefined()
    })

    it('throws for non-existent key', async () => {
      await expect(service.recordUsage('nonexistent')).rejects.toThrow('API key not found')
    })
  })
})
