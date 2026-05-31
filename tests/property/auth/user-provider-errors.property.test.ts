// Feature: auth-adapter-system, Property 7: UserProvider error semantics

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { YamlUserProvider } from '@/lib/auth/providers/yaml'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import { NotFoundError, ConflictError } from '@/lib/errors'

/**
 * Validates: Requirements 4.3, 4.4
 *
 * Property 7: UserProvider error semantics
 * - For any id that does not exist on disk, calling getById SHALL throw a NotFoundError.
 * - For any CreateUserInput whose id already exists on disk, calling create SHALL throw a ConflictError.
 */

// --- Setup ---

let tmpDir: string
let provider: YamlUserProvider

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-user-provider-'))
  const fsAdapter = new NodeFileSystemAdapter()
  const parser = new MarkdownYamlParser()
  provider = new YamlUserProvider(tmpDir, fsAdapter, parser)
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// --- Generators ---

/**
 * Generate valid user id strings: alphanumeric with hyphens, filesystem-safe.
 */
const userIdArb = fc
  .stringMatching(/^[a-z][a-z0-9-]{0,19}$/)
  .filter((id) => id.length >= 1 && !id.endsWith('-'))

/**
 * Generate a valid CreateUserInput given an id.
 */
function createUserInputArb(id: string) {
  return fc.record({
    id: fc.constant(id),
    email: fc.emailAddress(),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    password: fc.string({ minLength: 4, maxLength: 30 }),
    roles: fc.array(fc.constantFrom('admin', 'editor', 'viewer'), { minLength: 1, maxLength: 3 }),
  })
}

// --- Property Tests ---

describe('Property 7: UserProvider error semantics', () => {
  it('getById throws NotFoundError for any non-existent id', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, async (id) => {
        await expect(provider.getById(id)).rejects.toThrow(NotFoundError)
      }),
      { numRuns: 30 },
    )
  })

  it('create throws ConflictError when id already exists on disk', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb.chain((id) => createUserInputArb(id)),
        async (input) => {
          // First create succeeds
          await provider.create(input)

          // Second create with same id throws ConflictError
          await expect(provider.create(input)).rejects.toThrow(ConflictError)
        },
      ),
      { numRuns: 20 },
    )
  })
})
