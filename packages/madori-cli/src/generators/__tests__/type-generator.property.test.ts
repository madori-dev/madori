import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import type { FieldConfig, FieldType, FieldDefinition } from '@madori/lib/blueprints/types.js'
import { TypeGenerator } from '../type-generator.js'

/**
 * Property 1: Field type mapping correctness
 *
 * For any valid blueprint field definition with a known field type,
 * the TypeGenerator SHALL produce a TypeScript type string that matches
 * the defined mapping table.
 *
 * **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14**
 */
describe('Property 1: Field type mapping correctness', () => {
  const generator = new TypeGenerator()

  // --- Arbitraries ---

  /** Simple field types that map directly to 'string' */
  const stringFieldTypes: FieldType[] = ['text', 'slug', 'markdown', 'tiptap', 'code', 'hidden', 'date']

  const arbStringFieldType = fc.constantFrom(...stringFieldTypes)

  /** Arbitrary for option keys (valid JS identifiers for select/multiselect) */
  const arbOptionKey = fc.string({ minLength: 1, maxLength: 20 })
    .filter((s) => /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(s))

  /** Arbitrary for non-empty options record */
  const arbOptions = fc.uniqueArray(arbOptionKey, { minLength: 1, maxLength: 10 })
    .map((keys) => Object.fromEntries(keys.map((k) => [k, k])))

  /** Arbitrary for empty options (undefined or empty object) */
  const arbEmptyOptions = fc.constantFrom(undefined, {})

  /** Arbitrary for a select field with options */
  const arbSelectFieldWithOptions: fc.Arbitrary<FieldConfig> = arbOptions.map((opts) => ({
    type: 'select' as FieldType,
    options: opts,
  }))

  /** Arbitrary for a select field without options */
  const arbSelectFieldNoOptions: fc.Arbitrary<FieldConfig> = arbEmptyOptions.map((opts) => ({
    type: 'select' as FieldType,
    options: opts as Record<string, unknown> | undefined,
  }))

  /** Arbitrary for a multiselect field with options */
  const arbMultiselectFieldWithOptions: fc.Arbitrary<FieldConfig> = arbOptions.map((opts) => ({
    type: 'multiselect' as FieldType,
    options: opts,
  }))

  /** Arbitrary for a multiselect field without options */
  const arbMultiselectFieldNoOptions: fc.Arbitrary<FieldConfig> = arbEmptyOptions.map((opts) => ({
    type: 'multiselect' as FieldType,
    options: opts as Record<string, unknown> | undefined,
  }))

  /** Arbitrary for replicator set field definitions */
  const arbSetFields: fc.Arbitrary<FieldDefinition[]> = fc.array(
    fc.record({
      handle: fc.string({ minLength: 1, maxLength: 15 }).filter((s) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
      field: fc.record({
        type: fc.constantFrom('text', 'number', 'toggle') as fc.Arbitrary<FieldType>,
        required: fc.boolean(),
      }) as fc.Arbitrary<FieldConfig>,
    }),
    { minLength: 0, maxLength: 5 }
  )

  /** Arbitrary for a replicator set handle */
  const arbSetHandle = fc.string({ minLength: 1, maxLength: 15 })
    .filter((s) => /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(s))

  /** Arbitrary for replicator field with sets */
  const arbReplicatorFieldWithSets: fc.Arbitrary<FieldConfig> = fc.uniqueArray(
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

  /** Arbitrary for replicator field without sets */
  const arbReplicatorFieldNoSets: fc.Arbitrary<FieldConfig> = fc.constantFrom(
    { type: 'replicator' as FieldType },
    { type: 'replicator' as FieldType, options: {} },
    { type: 'replicator' as FieldType, options: { sets: {} } }
  )

  /** Arbitrary for grid column definitions */
  const arbGridColumns: fc.Arbitrary<FieldDefinition[]> = fc.array(
    fc.record({
      handle: fc.string({ minLength: 1, maxLength: 15 }).filter((s) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
      field: fc.record({
        type: fc.constantFrom('text', 'number', 'toggle') as fc.Arbitrary<FieldType>,
        required: fc.boolean(),
      }) as fc.Arbitrary<FieldConfig>,
    }),
    { minLength: 1, maxLength: 5 }
  )

  /** Arbitrary for grid field with columns */
  const arbGridFieldWithColumns: fc.Arbitrary<FieldConfig> = arbGridColumns.map((columns) => ({
    type: 'grid' as FieldType,
    options: { columns },
  }))

  /** Arbitrary for grid field without columns */
  const arbGridFieldNoColumns: fc.Arbitrary<FieldConfig> = fc.constantFrom(
    { type: 'grid' as FieldType },
    { type: 'grid' as FieldType, options: {} },
    { type: 'grid' as FieldType, options: { columns: [] } }
  )

  // --- Properties ---

  it('text, slug, markdown, tiptap, code, hidden, date → string', () => {
    fc.assert(
      fc.property(arbStringFieldType, (fieldType) => {
        const field: FieldConfig = { type: fieldType }
        const result = generator.mapFieldToType(field)
        expect(result).toBe('string')
      }),
      { numRuns: 100 }
    )
  })

  it('number → number', () => {
    fc.assert(
      fc.property(fc.constant('number' as FieldType), (fieldType) => {
        const field: FieldConfig = { type: fieldType }
        const result = generator.mapFieldToType(field)
        expect(result).toBe('number')
      }),
      { numRuns: 100 }
    )
  })

  it('toggle → boolean', () => {
    fc.assert(
      fc.property(fc.constant('toggle' as FieldType), (fieldType) => {
        const field: FieldConfig = { type: fieldType }
        const result = generator.mapFieldToType(field)
        expect(result).toBe('boolean')
      }),
      { numRuns: 100 }
    )
  })

  it('select with options → union of string literals', () => {
    fc.assert(
      fc.property(arbSelectFieldWithOptions, (field) => {
        const result = generator.mapFieldToType(field)
        const optionKeys = Object.keys(field.options!)
        // Each option key should appear as a string literal in the union
        for (const key of optionKeys) {
          expect(result).toContain(`'${key}'`)
        }
        // The result should be a pipe-separated union of string literals
        const expectedLiterals = optionKeys.map((k) => `'${k}'`).join(' | ')
        expect(result).toBe(expectedLiterals)
      }),
      { numRuns: 100 }
    )
  })

  it('select without options → string', () => {
    fc.assert(
      fc.property(arbSelectFieldNoOptions, (field) => {
        const result = generator.mapFieldToType(field)
        expect(result).toBe('string')
      }),
      { numRuns: 100 }
    )
  })

  it('multiselect with options → Array<union of string literals>', () => {
    fc.assert(
      fc.property(arbMultiselectFieldWithOptions, (field) => {
        const result = generator.mapFieldToType(field)
        const optionKeys = Object.keys(field.options!)
        const expectedLiterals = optionKeys.map((k) => `'${k}'`).join(' | ')
        expect(result).toBe(`Array<${expectedLiterals}>`)
      }),
      { numRuns: 100 }
    )
  })

  it('multiselect without options → string[]', () => {
    fc.assert(
      fc.property(arbMultiselectFieldNoOptions, (field) => {
        const result = generator.mapFieldToType(field)
        expect(result).toBe('string[]')
      }),
      { numRuns: 100 }
    )
  })

  it('asset → MadoriAsset', () => {
    fc.assert(
      fc.property(fc.constant({ type: 'asset' as FieldType } as FieldConfig), (field) => {
        const result = generator.mapFieldToType(field)
        expect(result).toBe('MadoriAsset')
      }),
      { numRuns: 100 }
    )
  })

  it('entries → MadoriEntryRef[]', () => {
    fc.assert(
      fc.property(fc.constant({ type: 'entries' as FieldType } as FieldConfig), (field) => {
        const result = generator.mapFieldToType(field)
        expect(result).toBe('MadoriEntryRef[]')
      }),
      { numRuns: 100 }
    )
  })

  it('taxonomy → string[]', () => {
    fc.assert(
      fc.property(fc.constant({ type: 'taxonomy' as FieldType } as FieldConfig), (field) => {
        const result = generator.mapFieldToType(field)
        expect(result).toBe('string[]')
      }),
      { numRuns: 100 }
    )
  })

  it('yaml → Record<string, unknown>', () => {
    fc.assert(
      fc.property(fc.constant({ type: 'yaml' as FieldType } as FieldConfig), (field) => {
        const result = generator.mapFieldToType(field)
        expect(result).toBe('Record<string, unknown>')
      }),
      { numRuns: 100 }
    )
  })

  it('replicator with sets → discriminated union with type discriminant per set', () => {
    fc.assert(
      fc.property(arbReplicatorFieldWithSets, (field) => {
        const result = generator.mapFieldToType(field)
        const sets = (field.options as Record<string, unknown>)['sets'] as Record<string, { fields?: FieldDefinition[] }>
        const setHandles = Object.keys(sets)

        // Each set handle should appear as a type discriminant
        for (const handle of setHandles) {
          expect(result).toContain(`type: '${handle}'`)
        }

        // The result should contain N variants separated by ' | '
        const variants = result.split(' | {')
        // First variant starts with '{', subsequent ones were split on ' | {'
        expect(variants.length).toBe(setHandles.length)
      }),
      { numRuns: 100 }
    )
  })

  it('replicator without sets → Record<string, unknown>', () => {
    fc.assert(
      fc.property(arbReplicatorFieldNoSets, (field) => {
        const result = generator.mapFieldToType(field)
        expect(result).toBe('Record<string, unknown>')
      }),
      { numRuns: 100 }
    )
  })

  it('grid with columns → Array<{ ... }> with column type declarations', () => {
    fc.assert(
      fc.property(arbGridFieldWithColumns, (field) => {
        const result = generator.mapFieldToType(field)
        const columns = (field.options as Record<string, unknown>)['columns'] as FieldDefinition[]

        // Result should start with 'Array<{' and end with '}>'
        expect(result).toMatch(/^Array<\{.*\}>$/)

        // Each column handle should appear in the result
        for (const col of columns) {
          expect(result).toContain(col.handle)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('grid without columns → Array<Record<string, unknown>>', () => {
    fc.assert(
      fc.property(arbGridFieldNoColumns, (field) => {
        const result = generator.mapFieldToType(field)
        expect(result).toBe('Array<Record<string, unknown>>')
      }),
      { numRuns: 100 }
    )
  })
})
