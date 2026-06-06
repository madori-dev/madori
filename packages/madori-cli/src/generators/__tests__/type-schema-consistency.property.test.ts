import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import type { Blueprint, FieldConfig, FieldDefinition, FieldType } from '@madori/lib/blueprints/types.js'
import { TypeGenerator } from '../type-generator.js'
import { SchemaGenerator } from '../schema-generator.js'

/**
 * Property 4: Type/Schema consistency
 *
 * For any valid blueprint field definition, the Zod schema produced by the
 * SchemaGenerator SHALL accept and validate data of exactly the same shape
 * as the TypeScript type produced by the TypeGenerator for that same field —
 * including optionality (`.optional()` applied iff `required !== true`).
 *
 * **Validates: Requirements 2.2, 2.4, 2.5**
 */

// --- Mapping from TypeScript type output → expected Zod base expression ---

/**
 * Given a TypeGenerator output string, returns the expected Zod base expression.
 * This validates that both generators agree on the fundamental type category.
 */
function expectedZodForTsType(tsType: string, field: FieldConfig): string | null {
  // Simple scalar mappings
  if (tsType === 'string') return 'z.string()'
  if (tsType === 'number') return 'z.number()'
  if (tsType === 'boolean') return 'z.boolean()'
  if (tsType === 'MadoriAsset') return null // complex object, skip deep check
  if (tsType === "MadoriEntryRef[]") return null // complex object, skip deep check
  if (tsType === "string[]") {
    // Could be taxonomy or multiselect without options
    if (field.type === 'taxonomy') return 'z.array(z.string())'
    if (field.type === 'multiselect') return 'z.array(z.string())'
    return null
  }
  if (tsType === 'Record<string, unknown>') return 'z.record(z.string(), z.unknown())'
  if (tsType === 'unknown') return 'z.unknown()'

  // Select with options: TS produces "'opt1' | 'opt2'", Zod produces "z.enum(['opt1', 'opt2'])"
  if (field.type === 'select' && field.options && Object.keys(field.options).length > 0) {
    const keys = Object.keys(field.options).map((k) => `'${k}'`).join(', ')
    return `z.enum([${keys}])`
  }

  // Multiselect with options: TS produces "Array<'opt1' | 'opt2'>", Zod produces "z.array(z.enum([...]))"
  if (field.type === 'multiselect' && field.options && Object.keys(field.options).length > 0) {
    const keys = Object.keys(field.options).map((k) => `'${k}'`).join(', ')
    return `z.array(z.enum([${keys}]))`
  }

  // Complex types (replicator, grid) — verify structure matches but skip exact string comparison
  return null
}

// --- Arbitraries ---

/** Simple field types that map to basic scalar types */
const simpleFieldTypes: FieldType[] = [
  'text', 'slug', 'markdown', 'tiptap', 'code', 'hidden', 'date',
  'number', 'toggle', 'asset', 'entries', 'taxonomy', 'yaml',
]

/** Arbitrary for the `required` field value */
const arbRequired = fc.constantFrom(true, false, undefined)

/** Arbitrary for valid option keys */
const arbOptionKey = fc.string({ minLength: 1, maxLength: 15 })
  .filter((s) => /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(s))

/** Arbitrary for non-empty options record */
const arbOptions = fc.uniqueArray(arbOptionKey, { minLength: 1, maxLength: 5 })
  .map((keys) => Object.fromEntries(keys.map((k) => [k, k])))

/** Arbitrary for a simple field config (no complex nested types) */
const arbSimpleFieldConfig: fc.Arbitrary<FieldConfig> = fc.tuple(
  fc.constantFrom(...simpleFieldTypes),
  arbRequired,
).map(([type, required]) => ({
  type,
  ...(required !== undefined ? { required } : {}),
}))

/** Arbitrary for a select field with options */
const arbSelectFieldWithOptions: fc.Arbitrary<FieldConfig> = fc.tuple(
  arbOptions,
  arbRequired,
).map(([opts, required]) => ({
  type: 'select' as FieldType,
  options: opts,
  ...(required !== undefined ? { required } : {}),
}))

/** Arbitrary for a select field without options */
const arbSelectFieldNoOptions: fc.Arbitrary<FieldConfig> = arbRequired.map((required) => ({
  type: 'select' as FieldType,
  ...(required !== undefined ? { required } : {}),
}))

/** Arbitrary for a multiselect field with options */
const arbMultiselectFieldWithOptions: fc.Arbitrary<FieldConfig> = fc.tuple(
  arbOptions,
  arbRequired,
).map(([opts, required]) => ({
  type: 'multiselect' as FieldType,
  options: opts,
  ...(required !== undefined ? { required } : {}),
}))

/** Arbitrary for a multiselect field without options */
const arbMultiselectFieldNoOptions: fc.Arbitrary<FieldConfig> = arbRequired.map((required) => ({
  type: 'multiselect' as FieldType,
  ...(required !== undefined ? { required } : {}),
}))

/** Arbitrary for a field config covering all simple + select/multiselect types */
const arbFieldConfig: fc.Arbitrary<FieldConfig> = fc.oneof(
  { weight: 6, arbitrary: arbSimpleFieldConfig },
  { weight: 2, arbitrary: arbSelectFieldWithOptions },
  { weight: 1, arbitrary: arbSelectFieldNoOptions },
  { weight: 2, arbitrary: arbMultiselectFieldWithOptions },
  { weight: 1, arbitrary: arbMultiselectFieldNoOptions },
)

/** Generate a valid field handle */
const arbFieldHandle = fc
  .tuple(
    fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm'),
    fc.stringMatching(/^[a-z0-9]{1,8}$/),
  )
  .map(([first, rest]) => `${first}${rest}Field`)

/** Arbitrary for a full field definition */
const arbFieldDefinition: fc.Arbitrary<FieldDefinition> = fc.tuple(
  arbFieldHandle,
  arbFieldConfig,
).map(([handle, field]) => ({ handle, field }))

/** Generate a blueprint with 1-5 fields */
const arbBlueprint: fc.Arbitrary<{ blueprint: Blueprint; fields: FieldDefinition[] }> = fc
  .array(arbFieldDefinition, { minLength: 1, maxLength: 5 })
  .map((fields) => {
    // Deduplicate handles
    const seen = new Set<string>()
    const uniqueFields = fields.filter((f) => {
      if (seen.has(f.handle)) return false
      seen.add(f.handle)
      return true
    })
    return {
      blueprint: {
        handle: 'test-blueprint',
        tabs: {
          main: {
            fields: uniqueFields,
          },
        },
      } as Blueprint,
      fields: uniqueFields,
    }
  })

describe('Property 4: Type/Schema consistency', () => {
  const typeGenerator = new TypeGenerator()
  const schemaGenerator = new SchemaGenerator()

  it('base type category is consistent between TypeGenerator and SchemaGenerator', () => {
    fc.assert(
      fc.property(arbFieldConfig, (field) => {
        const tsType = typeGenerator.mapFieldToType(field)
        const zodExpr = schemaGenerator.mapFieldToZod(field)
        const expectedZod = expectedZodForTsType(tsType, field)

        if (expectedZod !== null) {
          expect(zodExpr).toBe(expectedZod)
        }
      }),
      { numRuns: 200 }
    )
  })

  it('optionality is applied consistently: both generators agree on optional fields', () => {
    fc.assert(
      fc.property(arbBlueprint, ({ blueprint, fields }) => {
        const [typeFile] = typeGenerator.generate([blueprint])
        const schemaFiles = schemaGenerator.generate([blueprint])
        // Schema generator produces schema files + barrel; take the schema file
        const schemaFile = schemaFiles.find((f) => f.filename.includes('test-blueprint'))!

        const typeContent = typeFile.content
        const schemaContent = schemaFile.content

        for (const fd of fields) {
          const handle = fd.handle
          const isRequired = fd.field.required === true

          // Check TypeGenerator: optional fields have `handle?:` pattern
          // We look for `handle?:` (optional) vs `handle:` (required) in the output
          const optionalPattern = new RegExp(`\\b${handle}\\?\\s*:`)
          const fieldPresencePattern = new RegExp(`\\b${handle}[?]?\\s*:`)
          const optionalInType = optionalPattern.test(typeContent)
          const fieldPresentInType = fieldPresencePattern.test(typeContent)

          // Check SchemaGenerator: optional fields have `.optional()` as the
          // trailing modifier on the field line (before the comma).
          // We check that the line ends with `.optional(),` to distinguish from
          // nested `.optional()` inside complex types like asset's `alt` field.
          const schemaLineRegex = new RegExp(`^\\s*${handle}:\\s*(.+)$`, 'm')
          const schemaMatch = schemaContent.match(schemaLineRegex)
          expect(schemaMatch).not.toBeNull()

          const schemaLine = schemaMatch![1]
          // Check if the line ends with .optional(), or .optional() (with optional trailing comma)
          const hasOptionalInSchema = /\.optional\(\)\s*,?\s*$/.test(schemaLine)

          // Field must be present in type output
          expect(fieldPresentInType).toBe(true)

          if (isRequired) {
            // Both should be non-optional
            expect(optionalInType).toBe(false)
            expect(hasOptionalInSchema).toBe(false)
          } else {
            // Both should be optional
            expect(optionalInType).toBe(true)
            expect(hasOptionalInSchema).toBe(true)
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  it('string-type fields produce z.string() in schema', () => {
    const stringTypes: FieldType[] = ['text', 'slug', 'markdown', 'tiptap', 'code', 'hidden', 'date']

    fc.assert(
      fc.property(fc.constantFrom(...stringTypes), (fieldType) => {
        const field: FieldConfig = { type: fieldType }
        const tsType = typeGenerator.mapFieldToType(field)
        const zodExpr = schemaGenerator.mapFieldToZod(field)

        expect(tsType).toBe('string')
        expect(zodExpr).toBe('z.string()')
      }),
      { numRuns: 100 }
    )
  })

  it('number field produces z.number() in schema', () => {
    const field: FieldConfig = { type: 'number' }
    const tsType = typeGenerator.mapFieldToType(field)
    const zodExpr = schemaGenerator.mapFieldToZod(field)

    expect(tsType).toBe('number')
    expect(zodExpr).toBe('z.number()')
  })

  it('toggle field produces z.boolean() in schema', () => {
    const field: FieldConfig = { type: 'toggle' }
    const tsType = typeGenerator.mapFieldToType(field)
    const zodExpr = schemaGenerator.mapFieldToZod(field)

    expect(tsType).toBe('boolean')
    expect(zodExpr).toBe('z.boolean()')
  })

  it('select with options: TS union and Zod enum contain same option keys', () => {
    fc.assert(
      fc.property(arbSelectFieldWithOptions, (field) => {
        const tsType = typeGenerator.mapFieldToType(field)
        const zodExpr = schemaGenerator.mapFieldToZod(field)
        const optionKeys = Object.keys(field.options!)

        // TS should contain each key as a literal
        for (const key of optionKeys) {
          expect(tsType).toContain(`'${key}'`)
        }
        // Zod should contain each key in an enum
        for (const key of optionKeys) {
          expect(zodExpr).toContain(`'${key}'`)
        }
        // Both should reference exactly the same set of keys
        expect(zodExpr).toBe(`z.enum([${optionKeys.map((k) => `'${k}'`).join(', ')}])`)
      }),
      { numRuns: 100 }
    )
  })

  it('multiselect with options: TS Array<union> and Zod z.array(z.enum) contain same keys', () => {
    fc.assert(
      fc.property(arbMultiselectFieldWithOptions, (field) => {
        const tsType = typeGenerator.mapFieldToType(field)
        const zodExpr = schemaGenerator.mapFieldToZod(field)
        const optionKeys = Object.keys(field.options!)

        // TS: Array<'opt1' | 'opt2'>
        const expectedTs = `Array<${optionKeys.map((k) => `'${k}'`).join(' | ')}>`
        expect(tsType).toBe(expectedTs)

        // Zod: z.array(z.enum(['opt1', 'opt2']))
        const expectedZod = `z.array(z.enum([${optionKeys.map((k) => `'${k}'`).join(', ')}]))`
        expect(zodExpr).toBe(expectedZod)
      }),
      { numRuns: 100 }
    )
  })
})
