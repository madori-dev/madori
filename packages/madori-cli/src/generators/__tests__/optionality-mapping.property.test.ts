import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { TypeGenerator } from '../type-generator.js'
import type { Blueprint, FieldType } from '@madori/lib/blueprints/types.js'

/**
 * Property 2: Optionality mapping
 *
 * For any blueprint field definition, the generated TypeScript interface field
 * SHALL be marked optional (with `?`) if and only if the field's `required`
 * property is not `true` (i.e., `required` is `false` or absent).
 *
 * **Validates: Requirements 1.15, 1.16**
 */

/** All known simple field types (no complex options needed) */
const simpleFieldTypes: FieldType[] = [
  'text', 'slug', 'markdown', 'tiptap', 'code', 'hidden', 'date',
  'number', 'toggle', 'asset', 'entries', 'taxonomy', 'yaml',
]

/** Arbitrary for a simple field type */
const fieldTypeArb = fc.constantFrom(...simpleFieldTypes)

/** Arbitrary for the `required` field value: true, false, or undefined (absent) */
const requiredValueArb = fc.constantFrom(true, false, undefined)

/** Generate a valid field handle (lowercase letter + alphanumeric, no conflicts with TS keywords) */
const fieldHandleArb = fc
  .tuple(
    fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm'),
    fc.stringMatching(/^[a-z0-9]{1,10}$/)
  )
  .map(([first, rest]) => `${first}${rest}Field`)

/** Generate a field definition with a specific required value */
const fieldDefinitionArb = fc.tuple(fieldHandleArb, fieldTypeArb, requiredValueArb).map(
  ([handle, type, required]) => ({
    handle,
    field: {
      type,
      ...(required !== undefined ? { required } : {}),
    },
  })
)

/** Generate a blueprint with 1-5 fields having varying required values */
const blueprintWithFieldsArb = fc
  .array(fieldDefinitionArb, { minLength: 1, maxLength: 5 })
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

describe('TypeGenerator — Property 2: Optionality mapping', () => {
  const generator = new TypeGenerator()

  it('fields are marked optional iff required !== true', () => {
    fc.assert(
      fc.property(blueprintWithFieldsArb, ({ blueprint, fields }) => {
        const [generated] = generator.generate([blueprint])
        const content = generated.content

        for (const fd of fields) {
          const handle = fd.handle
          const isRequired = fd.field.required === true

          // Match the field declaration pattern in generated output
          // Required: `  handle: type`
          // Optional: `  handle?: type`
          const optionalPattern = new RegExp(`\\b${handle}\\?\\s*:`)
          const requiredPattern = new RegExp(`\\b${handle}\\s*:(?!\\s*')`)

          const hasOptionalMarker = optionalPattern.test(content)
          const hasRequiredMarker = requiredPattern.test(content) && !hasOptionalMarker

          if (isRequired) {
            // Field should NOT have `?`
            expect(hasOptionalMarker).toBe(false)
            expect(hasRequiredMarker).toBe(true)
          } else {
            // Field should have `?`
            expect(hasOptionalMarker).toBe(true)
          }
        }
      }),
      { numRuns: 100 }
    )
  })
})
