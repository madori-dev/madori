import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { McpPermissionChecker } from '../permissions'
import type { McpApiKey, McpPermission, McpResourceType, McpAction } from '../auth'

const checker = new McpPermissionChecker()

const RESOURCE_TYPES: McpResourceType[] = [
  'collections', 'entries', 'taxonomies', 'terms',
  'globals', 'navigation', 'assets', 'blueprints', 'fieldsets', 'forms',
]

const ACTIONS: McpAction[] = ['read', 'write']

// --- Arbitraries ---

const arbResourceType: fc.Arbitrary<McpResourceType> = fc.constantFrom(...RESOURCE_TYPES)
const arbAction: fc.Arbitrary<McpAction> = fc.constantFrom(...ACTIONS)
const arbScope: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 20 })
  .map(s => s.replace(/[^a-z\-_]/g, 'x'))
  .filter(s => s.length >= 1)

const arbPermission: fc.Arbitrary<McpPermission> = fc.record({
  resource: arbResourceType,
  actions: fc.subarray(ACTIONS, { minLength: 1 }),
  scope: fc.option(arbScope, { nil: undefined }),
})

const arbIsoTimestamp: fc.Arbitrary<string> = fc.integer({
  min: new Date('2020-01-01').getTime(),
  max: new Date('2030-01-01').getTime(),
}).map(ms => new Date(ms).toISOString())

function arbApiKey(overrides?: {
  permissions?: fc.Arbitrary<McpPermission[]>
  revokedAt?: fc.Arbitrary<string | undefined>
}): fc.Arbitrary<McpApiKey> {
  return fc.record({
    id: fc.uuid(),
    keyHash: fc.constant('scrypt:testhash'),
    label: fc.string({ minLength: 1, maxLength: 30 }),
    permissions: overrides?.permissions ?? fc.array(arbPermission, { minLength: 0, maxLength: 5 }),
    createdAt: arbIsoTimestamp,
    lastUsedAt: fc.option(arbIsoTimestamp, { nil: undefined }),
    revokedAt: overrides?.revokedAt ?? fc.constant(undefined),
  })
}

// --- Properties ---

/**
 * Property 19: MCP permission checker correctly enforces resource+action+scope
 * **Validates: Requirements 14.7, 16.1, 16.2**
 *
 * For any API key and tool invocation, access is granted iff the key has a matching
 * permission (resource, action, and scope either absent or matching). Revoked keys always deny.
 */
describe('McpPermissionChecker – Property 19: resource+action+scope enforcement', () => {
  it('grants access only when a permission matches resource, action, and scope', () => {
    fc.assert(
      fc.property(
        arbApiKey({ revokedAt: fc.constant(undefined) }),
        arbResourceType,
        arbAction,
        fc.option(arbScope, { nil: undefined }),
        (key, resource, action, scope) => {
          const result = checker.hasPermission(key, resource, action, scope)

          // Compute expected result manually
          const hasMatch = key.permissions.some(p => {
            if ((p.resource as string) === '*') return true
            if (p.resource !== resource) return false
            if (!p.actions.includes(action)) return false
            if (scope && p.scope && p.scope !== scope) return false
            return true
          })

          expect(result).toBe(hasMatch)
        },
      ),
    )
  })

  it('denies access when no permissions are defined', () => {
    fc.assert(
      fc.property(
        arbApiKey({ permissions: fc.constant([]), revokedAt: fc.constant(undefined) }),
        arbResourceType,
        arbAction,
        fc.option(arbScope, { nil: undefined }),
        (key, resource, action, scope) => {
          expect(checker.hasPermission(key, resource, action, scope)).toBe(false)
        },
      ),
    )
  })

  it('grants when permission resource+action match and no scope conflict', () => {
    fc.assert(
      fc.property(
        arbResourceType,
        arbAction,
        fc.option(arbScope, { nil: undefined }),
        (resource, action, scope) => {
          // Build a key that explicitly has the matching permission (no scope restriction)
          const key: McpApiKey = {
            id: 'match-key',
            keyHash: 'scrypt:hash',
            label: 'Test',
            permissions: [{ resource, actions: [action] }],
            createdAt: '2026-01-01T00:00:00.000Z',
          }
          expect(checker.hasPermission(key, resource, action, scope)).toBe(true)
        },
      ),
    )
  })
})

/**
 * Property 20: MCP wildcard permission grants access to all tools
 * **Validates: Requirements 16.3**
 *
 * For any API key with `*` wildcard permission, all tool invocations SHALL be
 * authorized (unless revoked).
 */
describe('McpPermissionChecker – Property 20: wildcard permission', () => {
  it('wildcard grants access for any resource, action, and scope', () => {
    fc.assert(
      fc.property(
        arbResourceType,
        arbAction,
        fc.option(arbScope, { nil: undefined }),
        (resource, action, scope) => {
          const key: McpApiKey = {
            id: 'wildcard-key',
            keyHash: 'scrypt:hash',
            label: 'Wildcard',
            permissions: [{ resource: '*' as unknown as McpResourceType, actions: [] }],
            createdAt: '2026-01-01T00:00:00.000Z',
          }
          expect(checker.hasPermission(key, resource, action, scope)).toBe(true)
        },
      ),
    )
  })

  it('wildcard among other permissions still grants universal access', () => {
    fc.assert(
      fc.property(
        fc.array(arbPermission, { minLength: 0, maxLength: 3 }),
        arbResourceType,
        arbAction,
        fc.option(arbScope, { nil: undefined }),
        (otherPerms, resource, action, scope) => {
          const key: McpApiKey = {
            id: 'wildcard-mix-key',
            keyHash: 'scrypt:hash',
            label: 'WildcardMix',
            permissions: [
              ...otherPerms,
              { resource: '*' as unknown as McpResourceType, actions: [] },
            ],
            createdAt: '2026-01-01T00:00:00.000Z',
          }
          expect(checker.hasPermission(key, resource, action, scope)).toBe(true)
        },
      ),
    )
  })

  it('revoked key with wildcard permission is still denied', () => {
    fc.assert(
      fc.property(
        arbResourceType,
        arbAction,
        fc.option(arbScope, { nil: undefined }),
        arbIsoTimestamp,
        (resource, action, scope, revokedAt) => {
          const key: McpApiKey = {
            id: 'revoked-wildcard',
            keyHash: 'scrypt:hash',
            label: 'RevokedWildcard',
            permissions: [{ resource: '*' as unknown as McpResourceType, actions: ['read', 'write'] }],
            createdAt: '2026-01-01T00:00:00.000Z',
            revokedAt,
          }
          expect(checker.hasPermission(key, resource, action, scope)).toBe(false)
        },
      ),
    )
  })
})

/**
 * Property 21: MCP collection-scoped permissions only grant access to the specified collection
 * **Validates: Requirements 16.5**
 *
 * For any key with `entries:read:blog` permission, read operations on `blog`
 * succeed and read operations on other collections are denied.
 */
describe('McpPermissionChecker – Property 21: collection-scoped permissions', () => {
  it('scoped permission grants access to the specified collection', () => {
    fc.assert(
      fc.property(
        arbResourceType,
        arbAction,
        arbScope,
        (resource, action, scope) => {
          const key: McpApiKey = {
            id: 'scoped-key',
            keyHash: 'scrypt:hash',
            label: 'Scoped',
            permissions: [{ resource, actions: [action], scope }],
            createdAt: '2026-01-01T00:00:00.000Z',
          }
          // Access to the matching scope should succeed
          expect(checker.hasPermission(key, resource, action, scope)).toBe(true)
        },
      ),
    )
  })

  it('scoped permission denies access to a different collection', () => {
    fc.assert(
      fc.property(
        arbResourceType,
        arbAction,
        arbScope,
        arbScope.filter(s => s.length >= 2), // ensure different scope possible
        (resource, action, grantedScope, requestedScope) => {
          // Skip when scopes happen to be identical
          fc.pre(grantedScope !== requestedScope)

          const key: McpApiKey = {
            id: 'scoped-key',
            keyHash: 'scrypt:hash',
            label: 'Scoped',
            permissions: [{ resource, actions: [action], scope: grantedScope }],
            createdAt: '2026-01-01T00:00:00.000Z',
          }
          // Access to a different scope should be denied
          expect(checker.hasPermission(key, resource, action, requestedScope)).toBe(false)
        },
      ),
    )
  })

  it('entries:read:blog pattern — grants read on blog, denies read on others', () => {
    fc.assert(
      fc.property(
        arbScope.filter(s => s !== 'blog'),
        (otherCollection) => {
          const key: McpApiKey = {
            id: 'blog-reader',
            keyHash: 'scrypt:hash',
            label: 'BlogReader',
            permissions: [{ resource: 'entries', actions: ['read'], scope: 'blog' }],
            createdAt: '2026-01-01T00:00:00.000Z',
          }
          // Read on blog → granted
          expect(checker.hasPermission(key, 'entries', 'read', 'blog')).toBe(true)
          // Read on other collection → denied
          expect(checker.hasPermission(key, 'entries', 'read', otherCollection)).toBe(false)
        },
      ),
    )
  })

  it('unscoped permission grants access regardless of requested scope', () => {
    fc.assert(
      fc.property(
        arbResourceType,
        arbAction,
        arbScope,
        (resource, action, requestedScope) => {
          const key: McpApiKey = {
            id: 'unscoped-key',
            keyHash: 'scrypt:hash',
            label: 'Unscoped',
            permissions: [{ resource, actions: [action] }], // no scope
            createdAt: '2026-01-01T00:00:00.000Z',
          }
          expect(checker.hasPermission(key, resource, action, requestedScope)).toBe(true)
        },
      ),
    )
  })
})

/**
 * Property 22: Revoked API keys are immediately rejected
 * **Validates: Requirements 15.5**
 *
 * For any API key with `revokedAt` set, all tool invocations SHALL return false.
 */
describe('McpPermissionChecker – Property 22: revoked key rejection', () => {
  it('any key with revokedAt set is always denied regardless of permissions', () => {
    fc.assert(
      fc.property(
        arbApiKey({ revokedAt: arbIsoTimestamp.map(t => t as string | undefined) }),
        arbResourceType,
        arbAction,
        fc.option(arbScope, { nil: undefined }),
        (key, resource, action, scope) => {
          // Ensure key is actually revoked
          fc.pre(key.revokedAt !== undefined)
          expect(checker.hasPermission(key, resource, action, scope)).toBe(false)
        },
      ),
    )
  })

  it('revoked key with all possible permissions is still denied', () => {
    fc.assert(
      fc.property(
        arbIsoTimestamp,
        arbResourceType,
        arbAction,
        fc.option(arbScope, { nil: undefined }),
        (revokedAt, resource, action, scope) => {
          // Key has permissions for every resource
          const allPermissions: McpPermission[] = RESOURCE_TYPES.map(r => ({
            resource: r,
            actions: ['read', 'write'] as McpAction[],
          }))

          const key: McpApiKey = {
            id: 'revoked-all',
            keyHash: 'scrypt:hash',
            label: 'RevokedAll',
            permissions: allPermissions,
            createdAt: '2026-01-01T00:00:00.000Z',
            revokedAt,
          }
          expect(checker.hasPermission(key, resource, action, scope)).toBe(false)
        },
      ),
    )
  })

  it('revoked key rejection does not depend on the revocation timestamp value', () => {
    fc.assert(
      fc.property(
        arbIsoTimestamp,
        arbResourceType,
        arbAction,
        (revokedAt, resource, action) => {
          const key: McpApiKey = {
            id: 'revoked-ts',
            keyHash: 'scrypt:hash',
            label: 'RevokedTS',
            permissions: [{ resource, actions: [action] }],
            createdAt: '2026-01-01T00:00:00.000Z',
            revokedAt,
          }
          // Any non-undefined revokedAt should deny
          expect(checker.hasPermission(key, resource, action)).toBe(false)
        },
      ),
    )
  })
})
