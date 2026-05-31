// Feature: auth-adapter-system, Property 16: User data structure invariant

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { YamlUserProvider } from '@/lib/auth/providers/yaml'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import type { CreateUserInput } from '@/lib/auth/types'

/**
 * Validates: Requirements 8.4
 *
 * Property: Every User from getById/getByEmail/list/create has non-empty id,
 * non-empty email, non-empty name, roles is an array, non-empty passwordHash,
 * and createdAt is a valid ISO 8601 date string.
 */

// --- Generators ---

const emailArb = fc.stringMatching(/^[a-z][a-z0-9]{0,8}@[a-z]{2,6}\.[a-z]{2,4}$/)
const nameArb = fc.stringMatching(/^[A-Za-z ]{1,32}$/).filter((s) => s.trim().length > 0)
const idArb = fc.stringMatching(/^[a-z0-9_-]{1,32}$/).filter((s) => s.length > 0)
const passwordArb = fc.string({ minLength: 4, maxLength: 32 })
const rolesArb = fc.array(fc.stringMatching(/^[a-z]{2,12}$/), { minLength: 1, maxLength: 4 })

const createUserInputArb: fc.Arbitrary<CreateUserInput> = fc.record({
  id: idArb,
  email: emailArb,
  name: nameArb,
  password: passwordArb,
  roles: rolesArb,
})

// --- Helpers ---

function assertUserStructure(user: unknown): void {
  const u = user as Record<string, unknown>

  // Non-empty id
  expect(typeof u.id).toBe('string')
  expect((u.id as string).length).toBeGreaterThan(0)

  // Non-empty email
  expect(typeof u.email).toBe('string')
  expect((u.email as string).length).toBeGreaterThan(0)

  // Non-empty name
  expect(typeof u.name).toBe('string')
  expect((u.name as string).length).toBeGreaterThan(0)

  // Roles is an array
  expect(Array.isArray(u.roles)).toBe(true)

  // Non-empty passwordHash
  expect(typeof u.passwordHash).toBe('string')
  expect((u.passwordHash as string).length).toBeGreaterThan(0)

  // createdAt is a valid ISO 8601 date string
  expect(typeof u.createdAt).toBe('string')
  const date = new Date(u.createdAt as string)
  expect(date.toString()).not.toBe('Invalid Date')
  expect((u.createdAt as string)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
}

// --- Property Tests ---

describe('Property 16: User data structure invariant', () => {
  let tmpDir: string
  let provider: YamlUserProvider

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-user-struct-'))
    const fsAdapter = new NodeFileSystemAdapter()
    const parser = new MarkdownYamlParser()
    provider = new YamlUserProvider(tmpDir, fsAdapter, parser)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('create returns a User with valid structure', async () => {
    await fc.assert(
      fc.asyncProperty(createUserInputArb, async (input) => {
        // Clean directory for each run to avoid ConflictError
        const files = await fs.readdir(tmpDir)
        for (const file of files) {
          await fs.unlink(path.join(tmpDir, file))
        }

        const user = await provider.create(input)
        assertUserStructure(user)
      }),
      { numRuns: 30 },
    )
  })

  it('getById returns a User with valid structure', async () => {
    await fc.assert(
      fc.asyncProperty(createUserInputArb, async (input) => {
        // Clean directory for each run
        const files = await fs.readdir(tmpDir)
        for (const file of files) {
          await fs.unlink(path.join(tmpDir, file))
        }

        const created = await provider.create(input)
        const fetched = await provider.getById(created.id)
        assertUserStructure(fetched)
      }),
      { numRuns: 30 },
    )
  })

  it('getByEmail returns a User with valid structure', async () => {
    await fc.assert(
      fc.asyncProperty(createUserInputArb, async (input) => {
        // Clean directory for each run
        const files = await fs.readdir(tmpDir)
        for (const file of files) {
          await fs.unlink(path.join(tmpDir, file))
        }

        await provider.create(input)
        const fetched = await provider.getByEmail(input.email)
        expect(fetched).not.toBeNull()
        assertUserStructure(fetched!)
      }),
      { numRuns: 30 },
    )
  })

  it('list returns Users with valid structure', async () => {
    await fc.assert(
      fc.asyncProperty(createUserInputArb, async (input) => {
        // Clean directory for each run
        const files = await fs.readdir(tmpDir)
        for (const file of files) {
          await fs.unlink(path.join(tmpDir, file))
        }

        await provider.create(input)
        const users = await provider.list()
        expect(users.length).toBeGreaterThan(0)
        for (const user of users) {
          assertUserStructure(user)
        }
      }),
      { numRuns: 30 },
    )
  })
})
