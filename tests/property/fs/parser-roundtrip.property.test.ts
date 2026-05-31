// Property 1: Definition file parse round-trip

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { UniversalFileParser } from '@/lib/fs/parser'

/**
 * Validates: Requirements 1.2, 3.1, 3.2, 3.4
 *
 * Property: For any valid definition object (taxonomy, global, navigation, or form),
 * serializing it to a file in any supported format (YAML or JSON) and then parsing
 * that file back should produce an equivalent object.
 */

// --- Generators ---

/** Arbitrary non-empty string for title fields */
const titleArb = fc
  .stringMatching(/^[a-zA-Z][a-zA-Z0-9 _-]{0,30}$/)
  .filter((s) => s.trim().length > 0)

/** Arbitrary optional non-empty string (for blueprint, route, etc.) */
const optionalStringArb = fc.option(
  fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,20}$/),
  { nil: undefined },
)

/** Arbitrary optional positive integer */
const optionalPositiveIntArb = fc.option(
  fc.integer({ min: 1, max: 100 }),
  { nil: undefined },
)

/** Arbitrary optional boolean */
const optionalBooleanArb = fc.option(fc.boolean(), { nil: undefined })

/** Arbitrary optional array of strings */
const optionalStringArrayArb = fc.option(
  fc.array(fc.stringMatching(/^[a-z][a-z0-9_-]{0,15}$/), { minLength: 1, maxLength: 5 }),
  { nil: undefined },
)

/** Generator for TaxonomyDefinition objects */
const taxonomyDefArb = fc.record({
  title: titleArb,
  blueprint: optionalStringArb,
})

/** Generator for GlobalDefinition objects */
const globalDefArb = fc.record({
  title: titleArb,
  blueprint: optionalStringArb,
})

/** Generator for NavigationDefinition objects */
const navigationDefArb = fc.record({
  title: titleArb,
  max_depth: optionalPositiveIntArb,
  collections: optionalStringArrayArb,
})

/** Generator for FormDefinition objects */
const formDefArb = fc.record({
  title: titleArb,
  blueprint: optionalStringArb,
  honeypot: optionalBooleanArb,
  store_submissions: optionalBooleanArb,
})

/** Combined generator for any definition type */
const anyDefinitionArb = fc.oneof(
  taxonomyDefArb,
  globalDefArb,
  navigationDefArb,
  formDefArb,
)

/** Format and matching file extension */
const formatWithExtArb = fc.constantFrom(
  { format: 'yaml' as const, ext: '.yaml' },
  { format: 'yaml' as const, ext: '.yml' },
  { format: 'json' as const, ext: '.json' },
)

// --- Helpers ---

/** Strip undefined keys from an object (matches serialization behavior) */
function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(obj))
}

// --- Property Tests ---

describe('Property 1: Definition file parse round-trip', () => {
  const parser = new UniversalFileParser()

  it('serializing to YAML then parsing back produces equivalent object', () => {
    fc.assert(
      fc.property(anyDefinitionArb, (definition) => {
        const cleaned = stripUndefined(definition)
        const serialized = parser.serialize(cleaned, 'yaml')
        const parsed = parser.parse('test.yaml', serialized)

        expect(parsed).toEqual(cleaned)
      }),
      { numRuns: 100 },
    )
  })

  it('serializing to JSON then parsing back produces equivalent object', () => {
    fc.assert(
      fc.property(anyDefinitionArb, (definition) => {
        const cleaned = stripUndefined(definition)
        const serialized = parser.serialize(cleaned, 'json')
        const parsed = parser.parse('test.json', serialized)

        expect(parsed).toEqual(cleaned)
      }),
      { numRuns: 100 },
    )
  })

  it('round-trip works for all definition types with any supported extension', () => {
    fc.assert(
      fc.property(anyDefinitionArb, formatWithExtArb, (definition, { format, ext }) => {
        const cleaned = stripUndefined(definition)
        const serialized = parser.serialize(cleaned, format)
        const parsed = parser.parse(`definition${ext}`, serialized)

        expect(parsed).toEqual(cleaned)
      }),
      { numRuns: 100 },
    )
  })
})
