import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { SDKClientGenerator } from '../sdk-client-generator.js'
import { toPascalCaseEntry } from '../type-generator.js'
import type { Blueprint } from '@madori/lib/blueprints/types.js'

/**
 * Property 6: SDK type inference per collection
 *
 * For any collection handle present in the generated `CollectionTypeMap`,
 * calling `client.getEntry(handle, slug)` SHALL return `Promise<T | null>`
 * and `client.listEntries(handle)` SHALL return `Promise<T[]>` where `T`
 * is the generated interface for that collection. For any string not in
 * `CollectionTypeMap`, these calls SHALL produce a compile-time type error.
 *
 * Since we're testing code generation (not runtime types), this property verifies
 * the generated code has the correct structure for TypeScript to enforce type safety:
 * - CollectionTypeMap maps each handle to the correct PascalCaseEntry type
 * - The client is parameterized with CollectionTypeMap (enabling inference)
 * - All types are imported correctly
 *
 * **Validates: Requirements 3.3, 3.4, 3.7**
 */

/** Generate a valid collection handle (lowercase alpha start, alphanumeric + hyphens) */
const collectionHandleArb = fc
  .tuple(
    fc.stringMatching(/^[a-z]$/),
    fc.stringMatching(/^[a-z0-9-]{0,14}$/)
  )
  .map(([first, rest]) => first + rest)
  .filter((h) => !h.endsWith('-') && !h.includes('--'))

/** Generate an array of unique collection handles */
const uniqueHandlesArb = (min: number, max: number) =>
  fc.uniqueArray(collectionHandleArb, { minLength: min, maxLength: max })

/** Build a minimal Blueprint from a handle */
function blueprintFromHandle(handle: string): Blueprint {
  return {
    handle,
    tabs: {
      main: {
        fields: [{ handle: 'title', field: { type: 'text', required: true } }],
      },
    },
  }
}

describe('SDKClientGenerator — Property 6: SDK type inference per collection', () => {
  const generator = new SDKClientGenerator()

  it('CollectionTypeMap has exactly N entries for N blueprints, each mapping handle to correct PascalCase type', () => {
    fc.assert(
      fc.property(
        uniqueHandlesArb(1, 10),
        (handles) => {
          const blueprints = handles.map(blueprintFromHandle)
          const result = generator.generate(blueprints)

          // Extract CollectionTypeMap body
          const typeMapMatch = result.content.match(
            /export interface CollectionTypeMap \{([^}]*)\}/
          )
          expect(typeMapMatch).not.toBeNull()

          const typeMapBody = typeMapMatch![1]
          const entries = typeMapBody
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0)

          // Exactly N entries in the map
          expect(entries).toHaveLength(handles.length)

          // Each handle maps to the correct PascalCaseEntry type
          for (const handle of handles) {
            const expectedType = toPascalCaseEntry(handle)
            const entryLine = entries.find((line) => line.startsWith(`${handle}:`))
            expect(entryLine).toBeDefined()
            expect(entryLine).toBe(`${handle}: ${expectedType}`)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('imports each collection type from the correct path', () => {
    fc.assert(
      fc.property(
        uniqueHandlesArb(1, 10),
        (handles) => {
          const blueprints = handles.map(blueprintFromHandle)
          const result = generator.generate(blueprints)

          for (const handle of handles) {
            const expectedType = toPascalCaseEntry(handle)
            const expectedImport = `import type { ${expectedType} } from './types/${handle}.js'`
            expect(result.content).toContain(expectedImport)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('creates client parameterized with CollectionTypeMap for type inference', () => {
    fc.assert(
      fc.property(
        uniqueHandlesArb(1, 10),
        (handles) => {
          const blueprints = handles.map(blueprintFromHandle)
          const result = generator.generate(blueprints)

          // Client is parameterized with CollectionTypeMap, which ensures
          // getEntry and listEntries return the correct type per handle
          expect(result.content).toContain('createClient<CollectionTypeMap>(')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('exports CollectionTypeMap type for external consumers', () => {
    fc.assert(
      fc.property(
        uniqueHandlesArb(1, 10),
        (handles) => {
          const blueprints = handles.map(blueprintFromHandle)
          const result = generator.generate(blueprints)

          // Exported type enables downstream type checking
          expect(result.content).toContain('export type { CollectionTypeMap }')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('imports createClient from @madori/sdk (SDK base)', () => {
    fc.assert(
      fc.property(
        uniqueHandlesArb(1, 10),
        (handles) => {
          const blueprints = handles.map(blueprintFromHandle)
          const result = generator.generate(blueprints)

          expect(result.content).toContain("import { createClient } from '@madori/sdk'")
        }
      ),
      { numRuns: 100 }
    )
  })
})
