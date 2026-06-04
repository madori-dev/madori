// Feature: project-madori, Property 3: Field Type Validation

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { BlueprintRegistry } from '@/lib/blueprints/registry'
import type { BlueprintLoader } from '@/lib/blueprints/loader'
import type { Blueprint, FieldType } from '@/lib/blueprints/types'

/**
 * Validates: Requirements 8.1
 *
 * Property: For each field type and any generated value, the field validator
 * should accept all values conforming to the field type's constraints and
 * reject all values violating those constraints.
 */

// --- Helpers ---

/**
 * Build a minimal blueprint with a single required field of the given type.
 */
function buildBlueprint(
  fieldType: FieldType,
  options?: Record<string, unknown>,
  required = true
): Blueprint {
  return {
    handle: 'test',
    tabs: {
      main: {
        fields: [
          {
            handle: 'value',
            field: {
              type: fieldType,
              required,
              ...(options ? { options } : {}),
            },
          },
        ],
      },
    },
  }
}

/**
 * Create a registry instance (loader is unused since we pass blueprints directly to validateData).
 */
const registry = new BlueprintRegistry({} as BlueprintLoader)

// --- Generators ---

/** Non-empty string arbitrary */
const nonEmptyString = fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.length > 0)

/** Valid slug: lowercase alphanumeric with hyphens */
const validSlug = fc
  .stringMatching(/^[a-z0-9][a-z0-9-]{0,49}$/)
  .filter((s) => s.length > 0)

/** Invalid slug: contains uppercase, spaces, or special chars */
const invalidSlug = fc.oneof(
  fc.string({ minLength: 1 }).filter((s) => /[A-Z]/.test(s)),
  fc.string({ minLength: 1 }).filter((s) => /\s/.test(s)),
  fc.string({ minLength: 1 }).filter((s) => /[^a-z0-9-]/.test(s) && s.length > 0),
  fc.constant(''),
)

/** Valid number values */
const validNumber = fc.oneof(
  fc.integer({ min: -1000000, max: 1000000 }),
  fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
)

/** Valid ISO date strings */
const validDate = fc
  .date({ min: new Date('1970-01-01'), max: new Date('2099-12-31'), noInvalidDate: true })
  .map((d) => d.toISOString())

/** Array of strings arbitrary */
const stringArray = fc.array(nonEmptyString, { minLength: 1, maxLength: 5 })

// --- Property Tests ---

describe('Property 3: Field Type Validation', () => {
  describe('text (required)', () => {
    const blueprint = buildBlueprint('text', undefined, true)

    it('accepts non-empty strings', () => {
      fc.assert(
        fc.property(nonEmptyString, (value) => {
          const result = registry.validateData(blueprint, { value })
          expect(result.success).toBe(true)
        }),
        { numRuns: 100 },
      )
    })

    it('rejects empty strings', () => {
      const result = registry.validateData(blueprint, { value: '' })
      expect(result.success).toBe(false)
    })

    it('rejects non-string types', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer(),
            fc.boolean(),
            fc.constant(null),
            fc.constant(undefined),
          ),
          (value) => {
            const result = registry.validateData(blueprint, { value })
            expect(result.success).toBe(false)
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('slug', () => {
    const blueprint = buildBlueprint('slug', undefined, true)

    it('accepts valid slugs (lowercase alphanumeric with hyphens)', () => {
      fc.assert(
        fc.property(validSlug, (value) => {
          const result = registry.validateData(blueprint, { value })
          expect(result.success).toBe(true)
        }),
        { numRuns: 100 },
      )
    })

    it('rejects invalid slugs', () => {
      fc.assert(
        fc.property(invalidSlug, (value) => {
          const result = registry.validateData(blueprint, { value })
          expect(result.success).toBe(false)
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('number', () => {
    const blueprint = buildBlueprint('number', undefined, true)

    it('accepts integers and floats', () => {
      fc.assert(
        fc.property(validNumber, (value) => {
          const result = registry.validateData(blueprint, { value })
          expect(result.success).toBe(true)
        }),
        { numRuns: 100 },
      )
    })

    it('rejects non-number types', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            nonEmptyString,
            fc.boolean(),
            fc.constant(null),
          ),
          (value) => {
            const result = registry.validateData(blueprint, { value })
            expect(result.success).toBe(false)
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('toggle', () => {
    const blueprint = buildBlueprint('toggle', undefined, true)

    it('accepts true and false', () => {
      fc.assert(
        fc.property(fc.boolean(), (value) => {
          const result = registry.validateData(blueprint, { value })
          expect(result.success).toBe(true)
        }),
        { numRuns: 100 },
      )
    })

    it('rejects non-boolean types', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            nonEmptyString,
            fc.integer(),
            fc.constant(null),
          ),
          (value) => {
            const result = registry.validateData(blueprint, { value })
            expect(result.success).toBe(false)
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('select (with options)', () => {
    const selectOptions = ['a', 'b', 'c'] as const
    const blueprint = buildBlueprint('select', selectOptions as unknown as Record<string, unknown>, true)

    it('accepts values that are one of the defined options', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...selectOptions),
          (value) => {
            const result = registry.validateData(blueprint, { value })
            expect(result.success).toBe(true)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('rejects values not in the options list', () => {
      fc.assert(
        fc.property(
          nonEmptyString.filter((s) => !selectOptions.includes(s as typeof selectOptions[number])),
          (value) => {
            const result = registry.validateData(blueprint, { value })
            expect(result.success).toBe(false)
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('multiselect', () => {
    const blueprint = buildBlueprint('multiselect', undefined, true)

    it('accepts arrays of strings', () => {
      fc.assert(
        fc.property(stringArray, (value) => {
          const result = registry.validateData(blueprint, { value })
          expect(result.success).toBe(true)
        }),
        { numRuns: 100 },
      )
    })

    it('rejects non-array types', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            nonEmptyString,
            fc.integer(),
            fc.boolean(),
          ),
          (value) => {
            const result = registry.validateData(blueprint, { value })
            expect(result.success).toBe(false)
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('date', () => {
    const blueprint = buildBlueprint('date', undefined, true)

    it('accepts ISO date strings', () => {
      fc.assert(
        fc.property(validDate, (value) => {
          const result = registry.validateData(blueprint, { value })
          expect(result.success).toBe(true)
        }),
        { numRuns: 100 },
      )
    })

    it('rejects non-string types', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer(),
            fc.boolean(),
            fc.constant(null),
          ),
          (value) => {
            const result = registry.validateData(blueprint, { value })
            expect(result.success).toBe(false)
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('asset', () => {
    const blueprint = buildBlueprint('asset', undefined, true)

    it('accepts path strings', () => {
      fc.assert(
        fc.property(nonEmptyString, (value) => {
          const result = registry.validateData(blueprint, { value })
          expect(result.success).toBe(true)
        }),
        { numRuns: 100 },
      )
    })

    it('rejects non-string types', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer(),
            fc.boolean(),
            fc.constant(null),
          ),
          (value) => {
            const result = registry.validateData(blueprint, { value })
            expect(result.success).toBe(false)
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('entries', () => {
    const blueprint = buildBlueprint('entries', undefined, true)

    it('accepts arrays of strings', () => {
      fc.assert(
        fc.property(stringArray, (value) => {
          const result = registry.validateData(blueprint, { value })
          expect(result.success).toBe(true)
        }),
        { numRuns: 100 },
      )
    })

    it('rejects non-array types', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            nonEmptyString,
            fc.integer(),
            fc.boolean(),
          ),
          (value) => {
            const result = registry.validateData(blueprint, { value })
            expect(result.success).toBe(false)
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('taxonomy', () => {
    const blueprint = buildBlueprint('taxonomy', undefined, true)

    it('accepts arrays of strings', () => {
      fc.assert(
        fc.property(stringArray, (value) => {
          const result = registry.validateData(blueprint, { value })
          expect(result.success).toBe(true)
        }),
        { numRuns: 100 },
      )
    })

    it('rejects non-array types', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            nonEmptyString,
            fc.integer(),
            fc.boolean(),
          ),
          (value) => {
            const result = registry.validateData(blueprint, { value })
            expect(result.success).toBe(false)
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
