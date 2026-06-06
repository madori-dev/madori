import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import type { FieldConfig, FieldType, FieldDefinition } from '@madori/lib/blueprints/types.js'
import { TypeGenerator } from '../type-generator.js'
import { SchemaGenerator } from '../schema-generator.js'

/**
 * Property 5: Replicator discriminated union generation
 *
 * For any replicator field with N defined sets, both the TypeGenerator and
 * SchemaGenerator SHALL produce a discriminated union with exactly N variants,
 * each using the set handle as the discriminant value under a `type` key.
 *
 * **Validates: Requirements 1.11, 2.7**
 */
describe('Property 5: Replicator discriminated union generation', () => {
  const typeGenerator = new TypeGenerator()
  const schemaGenerator = new SchemaGenerator()

  // --- Arbitraries ---

  /** Alphanumeric set handle (no special chars) */
  const arbSetHandle = fc.stringMatching(/^[a-z][a-z0-9]{0,14}$/)

  /** Simple field types for fields within sets */
  const arbSimpleFieldType = fc.constantFrom('text', 'number', 'toggle') as fc.Arbitrary<FieldType>

  /** Arbitrary field handle for fields within a set */
  const arbFieldHandle = fc.stringMatching(/^[a-z][a-z0-9]{0,9}$/)

  /** Arbitrary for fields within a replicator set (0-3 simple fields) */
  const arbSetFields: fc.Arbitrary<FieldDefinition[]> = fc.array(
    fc.record({
      handle: arbFieldHandle,
      field: fc.record({
        type: arbSimpleFieldType,
        required: fc.boolean(),
      }) as fc.Arbitrary<FieldConfig>,
    }),
    { minLength: 0, maxLength: 3 }
  )

  /** Arbitrary replicator field with 1-5 sets, each with unique handles */
  const arbReplicatorField: fc.Arbitrary<FieldConfig> = fc.uniqueArray(
    fc.tuple(arbSetHandle, arbSetFields),
    { minLength: 1, maxLength: 5, selector: ([handle]) => handle }
  ).map((entries) => ({
    type: 'replicator' as FieldType,
    options: {
      sets: Object.fromEntries(
        entries.map(([handle, fields]) => [handle, { fields }])
      ),
    },
  }))

  // --- Properties ---

  it('TypeGenerator produces exactly N type discriminant literals for N sets', () => {
    fc.assert(
      fc.property(arbReplicatorField, (field) => {
        const result = typeGenerator.mapFieldToType(field)
        const sets = (field.options as Record<string, unknown>)['sets'] as Record<string, { fields?: FieldDefinition[] }>
        const setHandles = Object.keys(sets)
        const n = setHandles.length

        // Each set handle should appear exactly once as `type: 'handle'`
        for (const handle of setHandles) {
          const pattern = `type: '${handle}'`
          const occurrences = result.split(pattern).length - 1
          expect(occurrences).toBe(1)
        }

        // Total number of variants should be N (split on ' | {')
        const variants = result.split(' | {')
        expect(variants.length).toBe(n)
      }),
      { numRuns: 100 }
    )
  })

  it('SchemaGenerator produces exactly N z.literal discriminants for N sets', () => {
    fc.assert(
      fc.property(arbReplicatorField, (field) => {
        const result = schemaGenerator.mapFieldToZod(field)
        const sets = (field.options as Record<string, unknown>)['sets'] as Record<string, { fields?: FieldDefinition[] }>
        const setHandles = Object.keys(sets)
        const n = setHandles.length

        // Each set handle should appear exactly once as z.literal('handle')
        for (const handle of setHandles) {
          const pattern = `z.literal('${handle}')`
          const occurrences = result.split(pattern).length - 1
          expect(occurrences).toBe(1)
        }

        // Should use z.discriminatedUnion with 'type' discriminant
        expect(result).toContain("z.discriminatedUnion('type'")

        // Should contain exactly N z.object variants
        const objectMatches = result.match(/z\.object\(/g)
        expect(objectMatches).not.toBeNull()
        expect(objectMatches!.length).toBe(n)
      }),
      { numRuns: 100 }
    )
  })

  it('TypeGenerator and SchemaGenerator produce the same number of variants', () => {
    fc.assert(
      fc.property(arbReplicatorField, (field) => {
        const typeResult = typeGenerator.mapFieldToType(field)
        const schemaResult = schemaGenerator.mapFieldToZod(field)
        const sets = (field.options as Record<string, unknown>)['sets'] as Record<string, { fields?: FieldDefinition[] }>
        const setHandles = Object.keys(sets)

        // Count type variants (split by ' | {')
        const typeVariants = typeResult.split(' | {').length

        // Count schema variants (z.object occurrences)
        const schemaVariants = (schemaResult.match(/z\.object\(/g) || []).length

        // Both should equal N
        expect(typeVariants).toBe(setHandles.length)
        expect(schemaVariants).toBe(setHandles.length)
      }),
      { numRuns: 100 }
    )
  })

  it('each set handle appears exactly once as discriminant in both generators', () => {
    fc.assert(
      fc.property(arbReplicatorField, (field) => {
        const typeResult = typeGenerator.mapFieldToType(field)
        const schemaResult = schemaGenerator.mapFieldToZod(field)
        const sets = (field.options as Record<string, unknown>)['sets'] as Record<string, { fields?: FieldDefinition[] }>
        const setHandles = Object.keys(sets)

        for (const handle of setHandles) {
          // TypeGenerator: type: 'handle' appears exactly once
          const typePattern = `type: '${handle}'`
          const typeOccurrences = typeResult.split(typePattern).length - 1
          expect(typeOccurrences).toBe(1)

          // SchemaGenerator: z.literal('handle') appears exactly once
          const schemaPattern = `z.literal('${handle}')`
          const schemaOccurrences = schemaResult.split(schemaPattern).length - 1
          expect(schemaOccurrences).toBe(1)
        }
      }),
      { numRuns: 100 }
    )
  })
})
