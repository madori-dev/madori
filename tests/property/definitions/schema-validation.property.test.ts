// Property 7: Schema validation correctness

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  TaxonomyDefinitionSchema,
  GlobalDefinitionSchema,
  NavigationDefinitionSchema,
  FormDefinitionSchema,
  DefinitionSchemas,
} from '@/lib/definitions/schemas'

/**
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
 *
 * Property: For any definition object and entity type, schema validation SHALL pass
 * if and only if all required fields are present with correct types. Specifically:
 * any object with a valid `title` string satisfies the minimum requirements for all
 * entity types, and any object missing `title` or with a non-string `title` SHALL
 * fail validation.
 */

// --- Generators ---

/** Arbitrary non-empty string for title field */
const validTitleArb = fc.string({ minLength: 1, maxLength: 100 })

/** Arbitrary non-string values to use as invalid title */
const invalidTitleArb = fc.oneof(
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.array(fc.anything(), { maxLength: 3 }),
  fc.dictionary(fc.string({ maxLength: 5 }), fc.anything(), { maxKeys: 3 }),
)

/** Arbitrary optional string for blueprint fields */
const optionalStringArb = fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined })

/** Arbitrary optional number for max_depth */
const optionalNumberArb = fc.option(fc.integer({ min: 1, max: 20 }), { nil: undefined })

/** Arbitrary optional boolean */
const optionalBooleanArb = fc.option(fc.boolean(), { nil: undefined })

/** Arbitrary optional array of strings for collections */
const optionalStringArrayArb = fc.option(
  fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 5 }),
  { nil: undefined },
)

// --- Schemas list for iteration ---

const allSchemas = [
  { name: 'TaxonomyDefinitionSchema', schema: TaxonomyDefinitionSchema },
  { name: 'GlobalDefinitionSchema', schema: GlobalDefinitionSchema },
  { name: 'NavigationDefinitionSchema', schema: NavigationDefinitionSchema },
  { name: 'FormDefinitionSchema', schema: FormDefinitionSchema },
] as const

// --- Property Tests ---

describe('Property 7: Schema validation correctness', () => {
  it('all 4 schemas pass validation for any object with a valid string title', async () => {
    await fc.assert(
      fc.asyncProperty(validTitleArb, async (title) => {
        const obj = { title }

        for (const { schema } of allSchemas) {
          const result = schema.safeParse(obj)
          expect(result.success).toBe(true)
        }
      }),
      { numRuns: 100 },
    )
  })

  it('all 4 schemas fail validation for any object missing title or with non-string title', async () => {
    await fc.assert(
      fc.asyncProperty(invalidTitleArb, async (invalidTitle) => {
        const obj = invalidTitle === undefined ? {} : { title: invalidTitle }

        for (const { schema } of allSchemas) {
          const result = schema.safeParse(obj)
          expect(result.success).toBe(false)
        }
      }),
      { numRuns: 100 },
    )
  })

  it('optional fields do not cause validation failure regardless of presence', async () => {
    await fc.assert(
      fc.asyncProperty(
        validTitleArb,
        optionalStringArb,
        optionalNumberArb,
        optionalBooleanArb,
        optionalStringArrayArb,
        async (title, blueprint, maxDepth, honeypot, collections) => {
          // Taxonomy: title + optional blueprint
          const taxonomyObj = Object.fromEntries(
            Object.entries({ title, blueprint }).filter(([, v]) => v !== undefined),
          )
          expect(TaxonomyDefinitionSchema.safeParse(taxonomyObj).success).toBe(true)

          // Global: title + optional blueprint
          const globalObj = Object.fromEntries(
            Object.entries({ title, blueprint }).filter(([, v]) => v !== undefined),
          )
          expect(GlobalDefinitionSchema.safeParse(globalObj).success).toBe(true)

          // Navigation: title + optional max_depth + optional collections
          const navObj = Object.fromEntries(
            Object.entries({ title, max_depth: maxDepth, collections }).filter(
              ([, v]) => v !== undefined,
            ),
          )
          expect(NavigationDefinitionSchema.safeParse(navObj).success).toBe(true)

          // Form: title + optional blueprint + optional honeypot + optional store_submissions
          const formObj = Object.fromEntries(
            Object.entries({ title, blueprint, honeypot, store_submissions: honeypot }).filter(
              ([, v]) => v !== undefined,
            ),
          )
          expect(FormDefinitionSchema.safeParse(formObj).success).toBe(true)
        },
      ),
      { numRuns: 100 },
    )
  })
})
