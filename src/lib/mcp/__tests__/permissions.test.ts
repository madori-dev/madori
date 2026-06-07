import { describe, it, expect } from 'vitest'
import { McpPermissionChecker } from '../permissions'
import type { McpApiKey } from '../auth'

describe('McpPermissionChecker', () => {
  const checker = new McpPermissionChecker()

  function makeKey(overrides: Partial<McpApiKey> = {}): McpApiKey {
    return {
      id: 'test-key-1',
      keyHash: 'scrypt:fakehash',
      label: 'Test Key',
      permissions: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    }
  }

  describe('revoked keys', () => {
    it('always denies access for revoked keys regardless of permissions', () => {
      const key = makeKey({
        revokedAt: '2026-06-01T00:00:00.000Z',
        permissions: [{ resource: 'entries', actions: ['read', 'write'] }],
      })

      expect(checker.hasPermission(key, 'entries', 'read')).toBe(false)
      expect(checker.hasPermission(key, 'entries', 'write')).toBe(false)
    })

    it('denies even with wildcard permission if revoked', () => {
      const key = makeKey({
        revokedAt: '2026-06-01T00:00:00.000Z',
        permissions: [{ resource: '*' as any, actions: ['read', 'write'] }],
      })

      expect(checker.hasPermission(key, 'entries', 'read')).toBe(false)
    })
  })

  describe('resource + action matching (Req 16.1)', () => {
    it('grants access when resource and action match', () => {
      const key = makeKey({
        permissions: [{ resource: 'entries', actions: ['read'] }],
      })

      expect(checker.hasPermission(key, 'entries', 'read')).toBe(true)
    })

    it('denies access when resource matches but action does not', () => {
      const key = makeKey({
        permissions: [{ resource: 'entries', actions: ['read'] }],
      })

      expect(checker.hasPermission(key, 'entries', 'write')).toBe(false)
    })

    it('denies access when action matches but resource does not', () => {
      const key = makeKey({
        permissions: [{ resource: 'entries', actions: ['read'] }],
      })

      expect(checker.hasPermission(key, 'assets', 'read')).toBe(false)
    })

    it('grants access when key has multiple permissions and one matches', () => {
      const key = makeKey({
        permissions: [
          { resource: 'entries', actions: ['read'] },
          { resource: 'assets', actions: ['read', 'write'] },
        ],
      })

      expect(checker.hasPermission(key, 'assets', 'write')).toBe(true)
    })
  })

  describe('permission not granted (Req 16.2)', () => {
    it('returns false when no permissions exist', () => {
      const key = makeKey({ permissions: [] })

      expect(checker.hasPermission(key, 'entries', 'read')).toBe(false)
    })

    it('returns false when no permission matches the request', () => {
      const key = makeKey({
        permissions: [
          { resource: 'blueprints', actions: ['read'] },
          { resource: 'forms', actions: ['read'] },
        ],
      })

      expect(checker.hasPermission(key, 'entries', 'write')).toBe(false)
    })
  })

  describe('wildcard permission (Req 16.3)', () => {
    it('grants access to any resource and action with wildcard', () => {
      const key = makeKey({
        permissions: [{ resource: '*' as any, actions: ['read', 'write'] }],
      })

      expect(checker.hasPermission(key, 'entries', 'read')).toBe(true)
      expect(checker.hasPermission(key, 'entries', 'write')).toBe(true)
      expect(checker.hasPermission(key, 'assets', 'read')).toBe(true)
      expect(checker.hasPermission(key, 'taxonomies', 'write')).toBe(true)
      expect(checker.hasPermission(key, 'globals', 'read')).toBe(true)
    })

    it('grants access with wildcard even when scope is specified', () => {
      const key = makeKey({
        permissions: [{ resource: '*' as any, actions: [] }],
      })

      expect(checker.hasPermission(key, 'entries', 'read', 'blog')).toBe(true)
    })
  })

  describe('collection-level scoping (Req 16.5)', () => {
    it('grants access when permission scope matches requested scope', () => {
      const key = makeKey({
        permissions: [{ resource: 'entries', actions: ['read'], scope: 'blog' }],
      })

      expect(checker.hasPermission(key, 'entries', 'read', 'blog')).toBe(true)
    })

    it('denies access when permission scope does not match requested scope', () => {
      const key = makeKey({
        permissions: [{ resource: 'entries', actions: ['read'], scope: 'blog' }],
      })

      expect(checker.hasPermission(key, 'entries', 'read', 'docs')).toBe(false)
    })

    it('grants access when permission has no scope (unscoped covers all)', () => {
      const key = makeKey({
        permissions: [{ resource: 'entries', actions: ['read'] }],
      })

      expect(checker.hasPermission(key, 'entries', 'read', 'blog')).toBe(true)
    })

    it('grants access when request has no scope and permission is scoped', () => {
      const key = makeKey({
        permissions: [{ resource: 'entries', actions: ['read'], scope: 'blog' }],
      })

      // No scope on request — the scope check only applies when both sides specify a scope
      expect(checker.hasPermission(key, 'entries', 'read')).toBe(true)
    })

    it('grants access when neither side specifies a scope', () => {
      const key = makeKey({
        permissions: [{ resource: 'entries', actions: ['read', 'write'] }],
      })

      expect(checker.hasPermission(key, 'entries', 'write')).toBe(true)
    })
  })
})
