// Property 7: Permission grant/deny correctness

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { PermissionGuard } from '@/lib/auth/guard'
import type { AuthContext } from '@/lib/auth/guard'
import type { PermissionChecker, ResourceType, Action, Permission, Role } from '@/lib/auth/permissions'

/**
 * Validates: Requirements 3.1, 3.2, 3.4, 3.5
 *
 * Property: For any combination of user roles, resource type, action, and optional scope,
 * `PermissionGuard.authorize()` SHALL grant access if and only if at least one of the user's
 * roles contains a permission matching the requested resource, action, and scope (where an
 * unscoped permission grants access to all scopes).
 */

// --- Types ---

const ALL_RESOURCE_TYPES: ResourceType[] = [
  'collections', 'entries', 'taxonomies', 'assets',
  'globals', 'forms', 'navigation', 'users', 'settings',
]

const ALL_ACTIONS: Action[] = ['view', 'create', 'edit', 'delete', 'publish']

// --- In-memory PermissionChecker ---

/**
 * A deterministic PermissionChecker backed by an in-memory role map.
 * Implements the same logic as the real PermissionChecker.hasPermission():
 * - Iterates roles, then permissions within each role
 * - Matches resource and action
 * - If scope is requested: permission must be unscoped or match exactly
 */
class InMemoryPermissionChecker {
  constructor(private readonly roles: Map<string, Role>) {}

  async hasPermission(
    userRoles: string[],
    resource: ResourceType,
    action: Action,
    scope?: string
  ): Promise<boolean> {
    for (const roleHandle of userRoles) {
      const role = this.roles.get(roleHandle)
      if (!role) continue

      for (const permission of role.permissions) {
        if (permission.resource !== resource) continue
        if (!permission.actions.includes(action)) continue

        // Scope matching: if a scope is requested, the permission must either
        // have no scope (grants all) or match the requested scope exactly.
        if (scope !== undefined) {
          if (permission.scope !== undefined && permission.scope !== scope) {
            continue
          }
        }
        return true
      }
    }
    return false
  }

  // Stub methods to satisfy PermissionChecker interface shape
  async loadRole(handle: string): Promise<Role | null> {
    return this.roles.get(handle) ?? null
  }

  async loadRoles(handles: string[]): Promise<Role[]> {
    return handles
      .map((h) => this.roles.get(h))
      .filter((r): r is Role => r !== null && r !== undefined)
  }
}

// --- Generators ---

const resourceTypeArb = fc.constantFrom(...ALL_RESOURCE_TYPES)
const actionArb = fc.constantFrom(...ALL_ACTIONS)
/** Alphanumeric string arbitrary (safe identifiers) */
const alphanumArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,14}$/)

const scopeArb = fc.oneof(
  fc.constant(undefined),
  fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,19}$/),
)

/** Generate a single Permission entry */
const permissionArb = fc.record({
  resource: resourceTypeArb,
  actions: fc.uniqueArray(actionArb, { minLength: 1, maxLength: 5 }),
  scope: scopeArb,
})

/** Generate a role with a handle and permissions list */
const roleArb = fc.record({
  handle: alphanumArb,
  display: fc.string({ minLength: 1, maxLength: 30 }),
  permissions: fc.array(permissionArb, { minLength: 0, maxLength: 5 }),
})

/** Generate a set of roles (1-4 roles with unique handles) */
const rolesArb = fc.array(roleArb, { minLength: 1, maxLength: 4 })
  .map((roles) => {
    // Ensure unique handles
    const seen = new Set<string>()
    return roles.filter((r) => {
      if (seen.has(r.handle)) return false
      seen.add(r.handle)
      return true
    })
  })
  .filter((roles) => roles.length > 0)

// --- Expected grant/deny logic (oracle) ---

/**
 * Oracle function: determines whether access should be granted.
 * Mirrors the PermissionChecker logic exactly.
 */
function shouldGrant(
  roles: Role[],
  userRoleHandles: string[],
  resource: ResourceType,
  action: Action,
  scope?: string
): boolean {
  const roleMap = new Map(roles.map((r) => [r.handle, r]))

  for (const handle of userRoleHandles) {
    const role = roleMap.get(handle)
    if (!role) continue

    for (const permission of role.permissions) {
      if (permission.resource !== resource) continue
      if (!permission.actions.includes(action)) continue

      if (scope !== undefined) {
        if (permission.scope !== undefined && permission.scope !== scope) {
          continue
        }
      }
      return true
    }
  }
  return false
}

// --- Property Tests ---

describe('Property 7: Permission grant/deny correctness', () => {
  it('authorize() grants access iff at least one role matches the requested resource/action/scope', async () => {
    await fc.assert(
      fc.asyncProperty(
        rolesArb,
        fc.array(alphanumArb, { minLength: 1, maxLength: 4 }),
        resourceTypeArb,
        actionArb,
        scopeArb,
        async (roles, userRoleHandles, resource, action, scope) => {
          // Build the in-memory checker from generated roles
          const roleMap = new Map(roles.map((r) => [r.handle, r]))
          const checker = new InMemoryPermissionChecker(roleMap) as unknown as PermissionChecker

          const guard = new PermissionGuard(checker, {
            permissions: new Map(),
          })

          const context: AuthContext = {
            userId: 'test-user',
            roles: userRoleHandles,
          }

          // Compute expected result using our oracle
          const expectedGrant = shouldGrant(roles, userRoleHandles, resource, action, scope)

          // Execute authorize
          let granted: boolean
          try {
            await guard.authorize(context, resource, action, scope)
            granted = true
          } catch {
            granted = false
          }

          expect(granted).toBe(expectedGrant)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('authorize() always denies when context is null (unauthenticated)', async () => {
    await fc.assert(
      fc.asyncProperty(
        rolesArb,
        resourceTypeArb,
        actionArb,
        scopeArb,
        async (roles, resource, action, scope) => {
          const roleMap = new Map(roles.map((r) => [r.handle, r]))
          const checker = new InMemoryPermissionChecker(roleMap) as unknown as PermissionChecker

          const guard = new PermissionGuard(checker, {
            permissions: new Map(),
          })

          // null context → always denied
          let granted: boolean
          try {
            await guard.authorize(null, resource, action, scope)
            granted = true
          } catch {
            granted = false
          }

          expect(granted).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('multi-role: access is granted if ANY role provides the permission', async () => {
    await fc.assert(
      fc.asyncProperty(
        resourceTypeArb,
        actionArb,
        scopeArb,
        alphanumArb,
        alphanumArb,
        async (resource, action, scope, roleHandle1, roleHandle2) => {
          // Ensure distinct handles
          const handle1 = `a${roleHandle1}`
          const handle2 = `b${roleHandle2}`

          // Role 1 has the permission, Role 2 does not
          const grantingRole: Role = {
            handle: handle1,
            display: 'Granting Role',
            permissions: [{ resource, actions: [action], scope }],
          }
          const denyingRole: Role = {
            handle: handle2,
            display: 'Denying Role',
            permissions: [], // no permissions
          }

          const roleMap = new Map<string, Role>([
            [handle1, grantingRole],
            [handle2, denyingRole],
          ])
          const checker = new InMemoryPermissionChecker(roleMap) as unknown as PermissionChecker

          const guard = new PermissionGuard(checker, {
            permissions: new Map(),
          })

          // User has both roles — should be granted because role1 has the permission
          const context: AuthContext = {
            userId: 'test-user',
            roles: [handle1, handle2],
          }

          let granted: boolean
          try {
            await guard.authorize(context, resource, action, scope)
            granted = true
          } catch {
            granted = false
          }

          expect(granted).toBe(true)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('unscoped permission grants access to all scopes', async () => {
    await fc.assert(
      fc.asyncProperty(
        resourceTypeArb,
        actionArb,
        fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,19}$/),
        alphanumArb,
        async (resource, action, anyScope, roleHandle) => {
          // Role has an unscoped permission (scope = undefined)
          const role: Role = {
            handle: roleHandle,
            display: 'Unscoped Role',
            permissions: [{ resource, actions: [action], scope: undefined }],
          }

          const roleMap = new Map<string, Role>([[roleHandle, role]])
          const checker = new InMemoryPermissionChecker(roleMap) as unknown as PermissionChecker

          const guard = new PermissionGuard(checker, {
            permissions: new Map(),
          })

          const context: AuthContext = {
            userId: 'test-user',
            roles: [roleHandle],
          }

          // Unscoped permission should grant access regardless of requested scope
          let granted: boolean
          try {
            await guard.authorize(context, resource, action, anyScope)
            granted = true
          } catch {
            granted = false
          }

          expect(granted).toBe(true)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('scoped permission only matches its specific scope', async () => {
    await fc.assert(
      fc.asyncProperty(
        resourceTypeArb,
        actionArb,
        fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,9}$/),
        alphanumArb,
        fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,9}$/),
        async (resource, action, permissionScope, roleHandle, requestedScope) => {
          // Ensure the requested scope is different from the permission scope
          fc.pre(requestedScope !== permissionScope)

          // Role has a scoped permission
          const role: Role = {
            handle: roleHandle,
            display: 'Scoped Role',
            permissions: [{ resource, actions: [action], scope: permissionScope }],
          }

          const roleMap = new Map<string, Role>([[roleHandle, role]])
          const checker = new InMemoryPermissionChecker(roleMap) as unknown as PermissionChecker

          const guard = new PermissionGuard(checker, {
            permissions: new Map(),
          })

          const context: AuthContext = {
            userId: 'test-user',
            roles: [roleHandle],
          }

          // With matching scope → granted
          let grantedMatching: boolean
          try {
            await guard.authorize(context, resource, action, permissionScope)
            grantedMatching = true
          } catch {
            grantedMatching = false
          }
          expect(grantedMatching).toBe(true)

          // With different scope → denied
          let grantedDifferent: boolean
          try {
            await guard.authorize(context, resource, action, requestedScope)
            grantedDifferent = true
          } catch {
            grantedDifferent = false
          }
          expect(grantedDifferent).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })
})
