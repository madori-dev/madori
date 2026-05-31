// Property 1: Schema validation accepts valid configs and rejects invalid ones

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { CollectionConfigSchema } from '@/lib/config/schema'

/**
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.2
 *
 * Property: For any object containing the required fields (title, handle, blueprint)
 * with correct types, plus any combination of optional fields with correct types,
 * CollectionConfigSchema.safeParse returns success. For any object where sortDirection
 * contains a value other than "asc" or "desc", safeParse returns failure.
 */

// --- Generators ---

/** Arbitrary non-empty string for required fields */
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0)

/** Arbitrary optional string field */
const optionalStringArb = fc.option(nonEmptyStringArb, { nil: undefined })

/** Arbitrary optional boolean field */
const optionalBooleanArb = fc.option(fc.boolean(), { nil: undefined })

/** Arbitrary optional sortDirection */
const optionalSortDirectionArb = fc.option(fc.constantFrom('asc' as const, 'desc' as const), { nil: undefined })

/** Arbitrary optional defaultStatus */
const optionalDefaultStatusArb = fc.option(fc.constantFrom('published' as const, 'draft' as const), { nil: undefined })

/** Arbitrary optional taxonomies array */
const optionalTaxonomiesArb = fc.option(fc.array(nonEmptyStringArb, { maxLength: 5 }), { nil: undefined })

/** Arbitrary optional blueprints array */
const optionalBlueprintsArb = fc.option(fc.array(nonEmptyStringArb, { maxLength: 5 }), { nil: undefined })

/** Arbitrary optional redirects object */
const optionalRedirectsArb = fc.option(
  fc.record({
    create: optionalStringArb,
    '404': optionalStringArb,
  }),
  { nil: undefined },
)

/** Generator for valid CollectionConfig objects */
const validCollectionConfigArb = fc.record({
  title: nonEmptyStringArb,
  handle: nonEmptyStringArb,
  blueprint: nonEmptyStringArb,
  route: optionalStringArb,
  sortable: optionalBooleanArb,
  dated: optionalBooleanArb,
  defaultStatus: optionalDefaultStatusArb,
  icon: optionalStringArb,
  sortDirection: optionalSortDirectionArb,
  template: optionalStringArb,
  layout: optionalStringArb,
  taxonomies: optionalTaxonomiesArb,
  redirects: optionalRedirectsArb,
  blueprints: optionalBlueprintsArb,
})

/** Generator for invalid sortDirection values (not "asc" or "desc") */
const invalidSortDirectionArb = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => s !== 'asc' && s !== 'desc')

// --- Property Tests ---

describe('Property 1: Schema validation accepts valid configs and rejects invalid ones', () => {
  it('accepts any valid collection config with correct required and optional fields', async () => {
    await fc.assert(
      fc.asyncProperty(validCollectionConfigArb, async (config) => {
        // Remove undefined keys to match real-world usage
        const cleaned = Object.fromEntries(
          Object.entries(config).filter(([, v]) => v !== undefined),
        )

        const result = CollectionConfigSchema.safeParse(cleaned)
        expect(result.success).toBe(true)
      }),
      { numRuns: 200 },
    )
  })

  it('rejects configs with invalid sortDirection values', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonEmptyStringArb,
        nonEmptyStringArb,
        nonEmptyStringArb,
        invalidSortDirectionArb,
        async (title, handle, blueprint, badSortDirection) => {
          const config = {
            title,
            handle,
            blueprint,
            sortDirection: badSortDirection,
          }

          const result = CollectionConfigSchema.safeParse(config)
          expect(result.success).toBe(false)
        },
      ),
      { numRuns: 200 },
    )
  })
})
