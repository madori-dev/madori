// Property 1: Config schema accepts valid configs and rejects invalid ones

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { StaticCacheConfigSchema, MadoriConfigSchema } from '@/lib/config/schema'

/**
 * Validates: Requirements 1.1, 5.1, 6.1, 14.4
 *
 * Properties:
 * 1. For any object with `driver` set to either "application" or "file", `enabled` as a boolean,
 *    `queryStrings` as either "ignore" or "separate", and `invalidationRules` as an array of
 *    { trigger: string, urls: string[] } objects, the schema SHALL parse successfully.
 * 2. For any object with `driver` set to a value outside ["application", "file"], the schema
 *    SHALL reject with a validation error.
 * 3. Omitting the `staticCache` key entirely should default to `enabled: false`.
 */

// --- Generators ---

/** Arbitrary non-empty string */
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0)

/** Arbitrary valid driver value */
const validDriverArb = fc.constantFrom('application' as const, 'file' as const)

/** Arbitrary valid queryStrings value */
const validQueryStringsArb = fc.constantFrom('ignore' as const, 'separate' as const)

/** Arbitrary invalidation rule */
const invalidationRuleArb = fc.record({
  trigger: nonEmptyStringArb,
  urls: fc.array(nonEmptyStringArb, { minLength: 0, maxLength: 5 }),
})

/** Generator for valid StaticCacheConfig objects */
const validStaticCacheConfigArb = fc.record({
  enabled: fc.boolean(),
  driver: validDriverArb,
  queryStrings: validQueryStringsArb,
  invalidationRules: fc.array(invalidationRuleArb, { minLength: 0, maxLength: 5 }),
})

/** Generator for invalid driver values (not "application" or "file") */
const invalidDriverArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s !== 'application' && s !== 'file')

// --- Property Tests ---

describe('Property 1: Config schema accepts valid configs and rejects invalid ones', () => {
  it('accepts any valid staticCache config with correct driver, enabled, queryStrings, and invalidationRules', async () => {
    await fc.assert(
      fc.asyncProperty(validStaticCacheConfigArb, async (config) => {
        const result = StaticCacheConfigSchema.safeParse(config)
        expect(result.success).toBe(true)
      }),
      { numRuns: 200 },
    )
  })

  it('rejects configs with driver set to a value outside ["application", "file"]', async () => {
    await fc.assert(
      fc.asyncProperty(invalidDriverArb, async (badDriver) => {
        const config = {
          enabled: true,
          driver: badDriver,
          queryStrings: 'ignore',
          invalidationRules: [],
        }

        const result = StaticCacheConfigSchema.safeParse(config)
        expect(result.success).toBe(false)
      }),
      { numRuns: 200 },
    )
  })

  it('omitting staticCache key entirely defaults to enabled: false', async () => {
    // Parse a config with no staticCache key — the MadoriConfigSchema should
    // apply defaults so that staticCache.enabled === false
    const result = MadoriConfigSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.staticCache.enabled).toBe(false)
    }
  })
})
