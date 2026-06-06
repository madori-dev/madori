import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import type { Blueprint, FieldDefinition, FieldConfig, FieldType } from '@madori/lib/blueprints/types.js'
import { GraphQLSDKGenerator } from '../graphql-sdk-generator.js'

/**
 * Property 7: GraphQL operations per collection
 *
 * For any collection with a valid blueprint, the GraphQL SDK Generator SHALL
 * produce exactly one `get{PascalCase}Entry(slug)` function returning
 * `Promise<T | null>` and one `list{PascalCase}Entries(options?)` function
 * returning `Promise<T[]>`, where T matches the generated TypeScript interface
 * for that collection.
 *
 * **Validates: Requirements 4.1, 4.2, 4.3**
 */
describe('Property 7: GraphQL operations per collection', () => {
  const generator = new GraphQLSDKGenerator()

  // --- Helpers ---

  /**
   * Converts a handle to PascalCase (without Entry suffix).
   * Mirrors the internal toPascalCase in graphql-sdk-generator.ts
   */
  function toPascalCase(handle: string): string {
    return handle
      .split(/[-_]/)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('')
  }

  /**
   * Converts a handle to PascalCase + "Entry" suffix.
   * Mirrors toPascalCaseEntry from type-generator.ts
   */
  function toPascalCaseEntry(handle: string): string {
    return `${toPascalCase(handle)}Entry`
  }

  // --- Arbitraries ---

  /** Valid blueprint handle: lowercase alpha start, optional hyphen-separated segments */
  const arbHandle = fc.stringMatching(/^[a-z][a-z]{0,7}(-[a-z][a-z]{0,7}){0,2}$/)

  /** Simple field type for populating blueprints */
  const arbSimpleFieldType = fc.constantFrom(
    'text', 'number', 'toggle', 'slug', 'markdown'
  ) as fc.Arbitrary<FieldType>

  /** Arbitrary field handle */
  const arbFieldHandle = fc.stringMatching(/^[a-z][a-z0-9]{0,9}$/)

  /** Arbitrary field definition */
  const arbFieldDefinition: fc.Arbitrary<FieldDefinition> = fc.record({
    handle: arbFieldHandle,
    field: fc.record({
      type: arbSimpleFieldType,
      required: fc.boolean(),
    }) as fc.Arbitrary<FieldConfig>,
  })

  /** Arbitrary blueprint with 1-5 fields */
  const arbBlueprint: fc.Arbitrary<Blueprint> = fc.record({
    handle: arbHandle,
    tabs: fc.record({
      main: fc.record({
        fields: fc.array(arbFieldDefinition, { minLength: 1, maxLength: 5 }),
      }),
    }),
  }) as fc.Arbitrary<Blueprint>

  /** Arbitrary array of 1-5 blueprints with unique handles */
  const arbBlueprints: fc.Arbitrary<Blueprint[]> = fc.uniqueArray(arbBlueprint, {
    minLength: 1,
    maxLength: 5,
    selector: (bp) => bp.handle,
  })

  // --- Properties ---

  it('produces exactly one operation file per collection', async () => {
    await fc.assert(
      fc.asyncProperty(arbBlueprints, async (blueprints) => {
        const files = await generator.generate(blueprints)

        // Operation files are those matching graphql/{handle}-operations.ts
        const operationFiles = files.filter((f) =>
          f.filename.match(/^graphql\/[a-z].*-operations\.ts$/)
        )

        // Should have exactly one operation file per blueprint
        expect(operationFiles.length).toBe(blueprints.length)

        // Each blueprint handle should have its own operation file
        for (const bp of blueprints) {
          const expected = `graphql/${bp.handle}-operations.ts`
          const found = operationFiles.find((f) => f.filename === expected)
          expect(found).toBeDefined()
        }
      }),
      { numRuns: 100 }
    )
  })

  it('each operation file contains exactly one get function with correct signature', async () => {
    await fc.assert(
      fc.asyncProperty(arbBlueprint, async (blueprint) => {
        const files = await generator.generate([blueprint])
        const opFile = files.find(
          (f) => f.filename === `graphql/${blueprint.handle}-operations.ts`
        )
        expect(opFile).toBeDefined()

        const content = opFile!.content
        const pascalCase = toPascalCase(blueprint.handle)
        const typeName = toPascalCaseEntry(blueprint.handle)

        // Should contain exactly one get function
        const getFnName = `get${pascalCase}Entry`
        const getFnSignature = `export async function ${getFnName}(slug: string): Promise<${typeName} | null>`
        const getFnOccurrences = content.split(getFnSignature).length - 1
        expect(getFnOccurrences).toBe(1)
      }),
      { numRuns: 100 }
    )
  })

  it('each operation file contains exactly one list function with correct signature', async () => {
    await fc.assert(
      fc.asyncProperty(arbBlueprint, async (blueprint) => {
        const files = await generator.generate([blueprint])
        const opFile = files.find(
          (f) => f.filename === `graphql/${blueprint.handle}-operations.ts`
        )
        expect(opFile).toBeDefined()

        const content = opFile!.content
        const pascalCase = toPascalCase(blueprint.handle)
        const typeName = toPascalCaseEntry(blueprint.handle)

        // Should contain exactly one list function
        const listFnName = `list${pascalCase}Entries`
        const listFnSignature = `export async function ${listFnName}(options?: ListOptions): Promise<${typeName}[]>`
        const listFnOccurrences = content.split(listFnSignature).length - 1
        expect(listFnOccurrences).toBe(1)
      }),
      { numRuns: 100 }
    )
  })

  it('get and list functions reference the correct type name for the collection', async () => {
    await fc.assert(
      fc.asyncProperty(arbBlueprint, async (blueprint) => {
        const files = await generator.generate([blueprint])
        const opFile = files.find(
          (f) => f.filename === `graphql/${blueprint.handle}-operations.ts`
        )
        expect(opFile).toBeDefined()

        const content = opFile!.content
        const typeName = toPascalCaseEntry(blueprint.handle)

        // Should import the correct type
        expect(content).toContain(`import type { ${typeName} }`)

        // Get function returns Promise<Type | null>
        expect(content).toContain(`Promise<${typeName} | null>`)

        // List function returns Promise<Type[]>
        expect(content).toContain(`Promise<${typeName}[]>`)
      }),
      { numRuns: 100 }
    )
  })

  it('total operation files equals number of blueprints', async () => {
    await fc.assert(
      fc.asyncProperty(arbBlueprints, async (blueprints) => {
        const files = await generator.generate(blueprints)

        // Operation files are those with -operations.ts suffix
        const operationFiles = files.filter((f) => f.filename.endsWith('-operations.ts'))

        expect(operationFiles.length).toBe(blueprints.length)
      }),
      { numRuns: 100 }
    )
  })
})
