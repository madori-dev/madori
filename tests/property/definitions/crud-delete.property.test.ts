// Property 9: CRUD delete completeness

import { describe, it, expect, afterEach } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { DefinitionLoader } from '@/lib/definitions/loader'
import { DefinitionNotFoundError, type EntityType } from '@/lib/definitions/errors'

/**
 * Validates: Requirements 6.3, 7.3, 8.5, 9.5
 *
 * Property: For any existing definition or content entry, a delete operation
 * SHALL remove the corresponding file such that a subsequent read of that
 * handle returns null/not-found.
 */

// --- Generators ---

/** Arbitrary valid handle: lowercase letter followed by alphanumeric/hyphens */
const handleArb = fc
  .stringMatching(/^[a-z][a-z0-9-]{0,20}$/)
  .filter((s) => s.length > 0)

/** Arbitrary entity type */
const entityTypeArb = fc.constantFrom<EntityType>(
  'taxonomies',
  'globals',
  'navigations',
  'forms',
)

/** Generate valid definition data for the given entity type */
function definitionDataArb(entityType: EntityType): fc.Arbitrary<Record<string, unknown>> {
  const titleArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0)

  switch (entityType) {
    case 'taxonomies':
      return fc.record({
        title: titleArb,
        blueprint: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
      })
    case 'globals':
      return fc.record({
        title: titleArb,
        blueprint: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
      })
    case 'navigations':
      return fc.record({
        title: titleArb,
        max_depth: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
        collections: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }), { nil: undefined }),
      })
    case 'forms':
      return fc.record({
        title: titleArb,
        blueprint: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
        honeypot: fc.option(fc.boolean(), { nil: undefined }),
        store_submissions: fc.option(fc.boolean(), { nil: undefined }),
      })
  }
}

// --- Test State ---

const tmpDirs: string[] = []

afterEach(async () => {
  for (const dir of tmpDirs) {
    await fs.rm(dir, { recursive: true, force: true })
  }
  tmpDirs.length = 0
})

// --- Property Tests ---

describe('Property 9: CRUD delete completeness', () => {
  it('create then delete definition, subsequent read throws DefinitionNotFoundError and file is removed from disk', () => {
    fc.assert(
      fc.asyncProperty(
        entityTypeArb.chain((entityType) =>
          fc.tuple(fc.constant(entityType), handleArb, definitionDataArb(entityType)),
        ),
        async ([entityType, handle, data]) => {
          // Create a temp directory
          const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-test-'))
          tmpDirs.push(tmpDir)

          const loader = new DefinitionLoader(tmpDir)

          // Create the definition
          await loader.create(entityType, handle, data)

          // Verify file exists on disk
          const expectedPath = path.join(tmpDir, entityType, `${handle}.yaml`)
          const existsBefore = await fs.access(expectedPath).then(() => true).catch(() => false)
          expect(existsBefore).toBe(true)

          // Delete the definition
          await loader.delete(entityType, handle)

          // Assert subsequent read throws DefinitionNotFoundError
          await expect(loader.load(entityType, handle)).rejects.toThrow(DefinitionNotFoundError)

          // Assert file no longer exists on disk
          const existsAfter = await fs.access(expectedPath).then(() => true).catch(() => false)
          expect(existsAfter).toBe(false)
        },
      ),
      { numRuns: 50 },
    )
  })
})
