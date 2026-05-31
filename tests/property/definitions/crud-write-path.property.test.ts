// Property 8: CRUD write path correctness

import { describe, it, expect, afterEach } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { DefinitionLoader } from '@/lib/definitions/loader'
import type { EntityType } from '@/lib/definitions/errors'

/**
 * Validates: Requirements 6.1, 7.1, 8.3, 9.3
 *
 * Property: For any valid entity type, handle, and definition data, a create
 * operation SHALL write the file to exactly {basePath}/{entityType}/{handle}.yaml
 * and a subsequent read of that handle SHALL return the written data.
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

/** Generate valid definition data matching the given entity type */
function definitionDataArb(entityType: EntityType): fc.Arbitrary<Record<string, unknown>> {
  const titleArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0)
  const blueprintArb = fc.option(fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0), { nil: undefined })

  switch (entityType) {
    case 'taxonomies':
    case 'globals':
      return fc.record({
        title: titleArb,
        blueprint: blueprintArb,
      }).map((r) => {
        const obj: Record<string, unknown> = { title: r.title }
        if (r.blueprint !== undefined) obj.blueprint = r.blueprint
        return obj
      })

    case 'navigations':
      return fc.record({
        title: titleArb,
        max_depth: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
        collections: fc.option(
          fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0), { minLength: 0, maxLength: 5 }),
          { nil: undefined },
        ),
      }).map((r) => {
        const obj: Record<string, unknown> = { title: r.title }
        if (r.max_depth !== undefined) obj.max_depth = r.max_depth
        if (r.collections !== undefined) obj.collections = r.collections
        return obj
      })

    case 'forms':
      return fc.record({
        title: titleArb,
        blueprint: blueprintArb,
        honeypot: fc.option(fc.boolean(), { nil: undefined }),
        store_submissions: fc.option(fc.boolean(), { nil: undefined }),
      }).map((r) => {
        const obj: Record<string, unknown> = { title: r.title }
        if (r.blueprint !== undefined) obj.blueprint = r.blueprint
        if (r.honeypot !== undefined) obj.honeypot = r.honeypot
        if (r.store_submissions !== undefined) obj.store_submissions = r.store_submissions
        return obj
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

describe('Property 8: CRUD write path correctness', () => {
  it('create writes file to correct path and subsequent read returns equivalent data', () => {
    fc.assert(
      fc.asyncProperty(
        entityTypeArb.chain((entityType) =>
          fc.tuple(fc.constant(entityType), handleArb, definitionDataArb(entityType)),
        ),
        async ([entityType, handle, data]) => {
          // Setup temp directory
          const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-crud-'))
          tmpDirs.push(tmpDir)

          const loader = new DefinitionLoader(tmpDir)

          // Create definition
          await loader.create(entityType, handle, data)

          // Assert file exists at the expected path
          const expectedPath = path.join(tmpDir, entityType, `${handle}.yaml`)
          const stat = await fs.stat(expectedPath)
          expect(stat.isFile()).toBe(true)

          // Read back and assert data matches
          const loaded = await loader.load(entityType, handle)
          expect(loaded).toEqual(data)
        },
      ),
      { numRuns: 50 },
    )
  })
})
