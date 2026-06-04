// Unit tests for PermissionGuard
// Validates: Requirements 6.3

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PermissionGuard } from '@/lib/auth/guard'
import type { AuthContext } from '@/lib/auth/guard'
import type { PermissionChecker, ResourceType, Action } from '@/lib/auth/permissions'
import { AuthorizationError } from '@/lib/errors'

/**
 * Unit tests for PermissionGuard covering:
 * - Grant: user has matching role/resource/action → authorize resolves without error
 * - Deny: user lacks permission → authorize throws AuthorizationError
 * - Multi-role: user has multiple roles, one grants access → succeeds
 * - Scoped: permission scoped to specific collection → only that collection granted
 * - Unauthenticated: null context → throws AuthorizationError
 * - wrapResolver: resolver executes when authorized, never executes when denied
 */

function createMockChecker(hasPermissionResult: boolean = true): PermissionChecker {
  return {
    hasPermission: vi.fn().mockResolvedValue(hasPermissionResult),
    loadRole: vi.fn(),
    loadRoles: vi.fn(),
  } as unknown as PermissionChecker
}

function createGuardConfig() {
  return {
    permissions: new Map(),
  }
}

describe('PermissionGuard', () => {
  let mockChecker: PermissionChecker
  let guard: PermissionGuard

  beforeEach(() => {
    mockChecker = createMockChecker(true)
    guard = new PermissionGuard(mockChecker, createGuardConfig())
  })

  describe('authorize', () => {
    it('resolves without error when user has matching permission (grant)', async () => {
      const context: AuthContext = { userId: 'user-1', roles: ['editor'] }

      await expect(
        guard.authorize(context, 'entries', 'edit')
      ).resolves.toBeUndefined()

      expect(mockChecker.hasPermission).toHaveBeenCalledWith(
        ['editor'],
        'entries',
        'edit',
        undefined
      )
    })

    it('throws AuthorizationError when user lacks permission (deny)', async () => {
      mockChecker = createMockChecker(false)
      guard = new PermissionGuard(mockChecker, createGuardConfig())
      const context: AuthContext = { userId: 'user-1', roles: ['viewer'] }

      await expect(
        guard.authorize(context, 'entries', 'delete')
      ).rejects.toThrow(AuthorizationError)

      expect(mockChecker.hasPermission).toHaveBeenCalledWith(
        ['viewer'],
        'entries',
        'delete',
        undefined
      )
    })

    it('grants access when user has multiple roles and one matches (multi-role)', async () => {
      // hasPermission checks all roles internally and returns true if any match
      mockChecker = createMockChecker(true)
      guard = new PermissionGuard(mockChecker, createGuardConfig())
      const context: AuthContext = { userId: 'user-1', roles: ['viewer', 'editor', 'admin'] }

      await expect(
        guard.authorize(context, 'entries', 'edit')
      ).resolves.toBeUndefined()

      expect(mockChecker.hasPermission).toHaveBeenCalledWith(
        ['viewer', 'editor', 'admin'],
        'entries',
        'edit',
        undefined
      )
    })

    it('passes scope to PermissionChecker for scoped permission checks', async () => {
      const context: AuthContext = { userId: 'user-1', roles: ['blog-editor'] }

      await expect(
        guard.authorize(context, 'entries', 'edit', 'blog')
      ).resolves.toBeUndefined()

      expect(mockChecker.hasPermission).toHaveBeenCalledWith(
        ['blog-editor'],
        'entries',
        'edit',
        'blog'
      )
    })

    it('denies scoped access when permission does not match scope', async () => {
      mockChecker = createMockChecker(false)
      guard = new PermissionGuard(mockChecker, createGuardConfig())
      const context: AuthContext = { userId: 'user-1', roles: ['blog-editor'] }

      await expect(
        guard.authorize(context, 'entries', 'edit', 'docs')
      ).rejects.toThrow(AuthorizationError)

      expect(mockChecker.hasPermission).toHaveBeenCalledWith(
        ['blog-editor'],
        'entries',
        'edit',
        'docs'
      )
    })

    it('throws AuthorizationError when auth context is null (unauthenticated)', async () => {
      await expect(
        guard.authorize(null, 'entries', 'view')
      ).rejects.toThrow(AuthorizationError)

      // hasPermission should never be called for unauthenticated requests
      expect(mockChecker.hasPermission).not.toHaveBeenCalled()
    })
  })

  describe('wrapResolver', () => {
    it('executes the resolver when authorization succeeds', async () => {
      const resolver = vi.fn().mockResolvedValue({ id: '1', title: 'Hello' })
      const wrapped = guard.wrapResolver('entries', 'view', resolver)

      const ctx = { auth: { userId: 'user-1', roles: ['editor'] } } as any
      const result = await wrapped({}, { collection: 'blog' }, ctx)

      expect(result).toEqual({ id: '1', title: 'Hello' })
      expect(resolver).toHaveBeenCalledTimes(1)
      expect(resolver).toHaveBeenCalledWith({}, { collection: 'blog' }, ctx)
    })

    it('never executes the resolver when authorization fails', async () => {
      mockChecker = createMockChecker(false)
      guard = new PermissionGuard(mockChecker, createGuardConfig())
      const resolver = vi.fn().mockResolvedValue({ id: '1' })
      const wrapped = guard.wrapResolver('entries', 'delete', resolver)

      const ctx = { auth: { userId: 'user-1', roles: ['viewer'] } } as any

      await expect(wrapped({}, {}, ctx)).rejects.toThrow(AuthorizationError)
      expect(resolver).not.toHaveBeenCalled()
    })

    it('never executes the resolver when auth context is missing', async () => {
      const resolver = vi.fn().mockResolvedValue({ id: '1' })
      const wrapped = guard.wrapResolver('entries', 'edit', resolver)

      // ctx without auth defaults to null
      const ctx = {} as any

      await expect(wrapped({}, {}, ctx)).rejects.toThrow(AuthorizationError)
      expect(resolver).not.toHaveBeenCalled()
    })

    it('extracts scope from args using scope function', async () => {
      const resolver = vi.fn().mockResolvedValue([])
      const scopeFn = (args: { collection: string }) => args.collection
      const wrapped = guard.wrapResolver('entries', 'view', resolver, scopeFn)

      const ctx = { auth: { userId: 'user-1', roles: ['blog-editor'] } } as any
      await wrapped({}, { collection: 'blog' }, ctx)

      expect(mockChecker.hasPermission).toHaveBeenCalledWith(
        ['blog-editor'],
        'entries',
        'view',
        'blog'
      )
      expect(resolver).toHaveBeenCalledTimes(1)
    })

    it('passes undefined scope when no scope function is provided', async () => {
      const resolver = vi.fn().mockResolvedValue([])
      const wrapped = guard.wrapResolver('entries', 'view', resolver)

      const ctx = { auth: { userId: 'user-1', roles: ['admin'] } } as any
      await wrapped({}, {}, ctx)

      expect(mockChecker.hasPermission).toHaveBeenCalledWith(
        ['admin'],
        'entries',
        'view',
        undefined
      )
    })
  })
})
