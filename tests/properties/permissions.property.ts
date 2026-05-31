// Feature: project-madori, Property 6: Permission Check Determinism

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { stringify as stringifyYaml } from 'yaml'
import { PermissionChecker } from '@/lib/auth/permissions'
import type { ResourceType, Action, Role, Permission } from '@/lib/auth/permissions'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'

/**
 * Validates: Requirements 10.2
 *
 * Property: For any user with a set of assigned roles, and for any resource type
 * and action pair, the permission check function should return true if and only if
 * at least one of the user's roles grants that action on that resource. The result
 * must be deterministic and consistent regardless of role evaluation order.
 */

// --- In-Memory FileSystemAdapter ---

class InMemoryFileSystemAdapter implements FileSystemAdapter {
  private files: Map<string, string> = new Map()

  constructor(files?: Record<string, string>) {
    if (files) {
      for (const [path, content] of Object.entries(files)) {
        this.files.set(path, content)
      }
    }
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path)
    if (content === undefined) {
      throw new Error(`File not found: ${path}`)
    }
    return content
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content)
  }

  async deleteFile(path: string): Promise<void> {
    this.files.delete(path)
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path)
  }

  async listFiles(_directory: string, _pattern?: string): Promise<string[]> {
    return Array.from(this.files.keys())
  }

  async listDirectories(_directory: string): Promise<string[]> {
    return []
  }

  async mkdir(_path: string): Promise<void> {}

  async copyFile(src: string, dest: string): Promise<void> {
    const content = this.files.get(src)
    if (content !== undefined) {
      this.files.set(dest, content)
    }
  }

  async moveFile(src: string, dest: string): Promise<void> {
    const content = this.files.get(src)
    if (content !== undefined) {
      this.files.set(dest, content)
      this.files.delete(src)
    }
  }
}

// --- Generators ---

const RESOURCE_TYPES: ResourceType[] = [
  'collections',
  'entries',
  'taxonomies',
  'assets',
  'globals',
  'forms',
  'navigation',
  'users',
  'settings',
]

const ACTIONS: Action[] = ['view', 'create', 'edit', 'delete', 'publish']

const resourceTypeArb: fc.Arbitrary<ResourceType> = fc.constantFrom(...RESOURCE_TYPES)

const actionArb: fc.Arbitrary<Action> = fc.constantFrom(...ACTIONS)

const permissionArb: fc.Arbitrary<Permission> = fc.record({
  resource: resourceTypeArb,
  actions: fc.uniqueArray(actionArb, { minLength: 1, maxLength: 5 }),
  scope: fc.option(
    fc.stringMatching(/^[a-z][a-z0-9_]{0,9}$/),
    { nil: undefined },
  ),
})

const roleArb: fc.Arbitrary<Role> = fc.record({
  handle: fc.stringMatching(/^[a-z][a-z0-9_]{2,9}$/),
  display: fc.string({ minLength: 1, maxLength: 20 }),
  permissions: fc.array(permissionArb, { minLength: 1, maxLength: 5 }),
})

// --- Helpers ---

function buildRoleFiles(roles: Role[], basePath: string): Record<string, string> {
  const files: Record<string, string> = {}
  for (const role of roles) {
    const filePath = `${basePath}/roles/${role.handle}.yaml`
    files[filePath] = stringifyYaml({
      handle: role.handle,
      display: role.display,
      permissions: role.permissions,
    })
  }
  return files
}

function createChecker(roles: Role[], basePath: string): PermissionChecker {
  const files = buildRoleFiles(roles, basePath)
  const fs = new InMemoryFileSystemAdapter(files)
  const parser = new MarkdownYamlParser()
  return new PermissionChecker(fs, parser, basePath)
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// --- Property Tests ---

describe('Property 6: Permission Check Determinism', () => {
  it('calling hasPermission with the same inputs always returns the same result', async () => {
    const basePath = '/resources'

    await fc.assert(
      fc.asyncProperty(
        fc.array(roleArb, { minLength: 1, maxLength: 4 }),
        resourceTypeArb,
        actionArb,
        fc.option(fc.stringMatching(/^[a-z][a-z0-9_]{0,9}$/), { nil: undefined }),
        async (roles, resource, action, scope) => {
          // Deduplicate role handles
          const uniqueRoles = roles.filter(
            (r, i, arr) => arr.findIndex((x) => x.handle === r.handle) === i,
          )
          if (uniqueRoles.length === 0) return

          const checker = createChecker(uniqueRoles, basePath)
          const userRoles = uniqueRoles.map((r) => r.handle)

          // Call multiple times with the same inputs
          const result1 = await checker.hasPermission(userRoles, resource, action, scope)
          const result2 = await checker.hasPermission(userRoles, resource, action, scope)
          const result3 = await checker.hasPermission(userRoles, resource, action, scope)

          expect(result1).toBe(result2)
          expect(result2).toBe(result3)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('shuffling the user roles array does not change the result (order independence)', async () => {
    const basePath = '/resources'

    await fc.assert(
      fc.asyncProperty(
        fc.array(roleArb, { minLength: 2, maxLength: 5 }),
        resourceTypeArb,
        actionArb,
        fc.option(fc.stringMatching(/^[a-z][a-z0-9_]{0,9}$/), { nil: undefined }),
        async (roles, resource, action, scope) => {
          // Deduplicate role handles
          const uniqueRoles = roles.filter(
            (r, i, arr) => arr.findIndex((x) => x.handle === r.handle) === i,
          )
          if (uniqueRoles.length < 2) return

          const checker = createChecker(uniqueRoles, basePath)
          const userRoles = uniqueRoles.map((r) => r.handle)

          const resultOriginal = await checker.hasPermission(userRoles, resource, action, scope)

          // Shuffle roles multiple times and verify same result
          for (let i = 0; i < 3; i++) {
            const shuffled = shuffle(userRoles)
            const resultShuffled = await checker.hasPermission(shuffled, resource, action, scope)
            expect(resultShuffled).toBe(resultOriginal)
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('adding more roles to a user can only grant more permissions (monotonicity)', async () => {
    const basePath = '/resources'

    await fc.assert(
      fc.asyncProperty(
        fc.array(roleArb, { minLength: 2, maxLength: 5 }),
        resourceTypeArb,
        actionArb,
        fc.option(fc.stringMatching(/^[a-z][a-z0-9_]{0,9}$/), { nil: undefined }),
        async (roles, resource, action, scope) => {
          // Deduplicate role handles
          const uniqueRoles = roles.filter(
            (r, i, arr) => arr.findIndex((x) => x.handle === r.handle) === i,
          )
          if (uniqueRoles.length < 2) return

          const checker = createChecker(uniqueRoles, basePath)

          // Take a subset of roles (first role only)
          const subsetRoles = [uniqueRoles[0].handle]
          const allRoles = uniqueRoles.map((r) => r.handle)

          const resultSubset = await checker.hasPermission(subsetRoles, resource, action, scope)
          const resultAll = await checker.hasPermission(allRoles, resource, action, scope)

          // If the subset grants permission, the superset must also grant it
          if (resultSubset) {
            expect(resultAll).toBe(true)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
