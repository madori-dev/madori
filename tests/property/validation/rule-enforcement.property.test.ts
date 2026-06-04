// Property 1: Validation Rule Enforcement

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { validateFields, isRuleApplicable } from '@/lib/validation/rules'
import type { FieldConfig, FieldType } from '@/lib/blueprints/types'

/**
 * Validates: Requirements 2.4, 4.2, 4.7
 *
 * Property: For any field configuration with validation rules and any input value,
 * the validation engine SHALL produce the same pass/fail result regardless of
 * execution context. Furthermore, for any input that violates a rule, the returned
 * errors SHALL be keyed by the field handle that was violated.
 */

// --- Generators ---

/** Arbitrary field handle (valid identifier) */
const handleArb = fc.stringMatching(/^[a-z][a-z0-9_]{1,15}$/)

/** All string-based field types */
const stringFieldTypes: FieldType[] = ['text', 'slug', 'markdown', 'tiptap', 'code']

/** Arbitrary string field type */
const stringFieldTypeArb = fc.constantFrom(...stringFieldTypes)

/** Arbitrary number field type */
const numberFieldTypeArb = fc.constant('number' as FieldType)

/** Arbitrary field type that supports validation */
const validatableFieldTypeArb = fc.oneof(stringFieldTypeArb, numberFieldTypeArb)

/** Generate a valid rule for a string field type (no min/max conflicts) */
const stringRuleArb = fc.oneof(
  fc.constant('required'),
  fc.constant('email'),
  fc.constant('url'),
  fc.constantFrom('regex:^[a-z]+$', 'regex:^\\d+$', 'regex:^[A-Z][a-z]+$')
)

/** Generate a consistent min/max pair for string fields */
const stringMinMaxRulesArb = fc.record({
  min: fc.integer({ min: 1, max: 20 }),
  max: fc.integer({ min: 21, max: 200 }),
}).map(({ min, max }) => [`min:${min}`, `max:${max}`])

/** Generate a valid rule for a number field type (no min/max conflicts) */
const numberRuleArb = fc.oneof(
  fc.constant('required'),
  fc.record({
    min: fc.integer({ min: -100, max: 0 }),
    max: fc.integer({ min: 1, max: 100 }),
  }).map(({ min, max }) => `numeric_range:${min},${max}`)
)

/** Generate a FieldConfig for a string field with applicable rules */
const stringFieldConfigArb = fc.oneof(
  // Config with individual rules (no min/max)
  fc.record({
    type: stringFieldTypeArb,
    required: fc.boolean(),
    validate: fc.array(stringRuleArb, { minLength: 0, maxLength: 2 }),
  }).map(({ type, required, validate }) => ({
    type,
    required,
    validate,
  } as FieldConfig)),
  // Config with consistent min/max pair
  fc.record({
    type: stringFieldTypeArb,
    required: fc.boolean(),
    minMax: stringMinMaxRulesArb,
  }).map(({ type, required, minMax }) => ({
    type,
    required,
    validate: minMax,
  } as FieldConfig)),
)

/** Generate a FieldConfig for a number field with applicable rules */
const numberFieldConfigArb = fc.record({
  required: fc.boolean(),
  validate: fc.array(numberRuleArb, { minLength: 0, maxLength: 2 }),
}).map(({ required, validate }) => ({
  type: 'number' as FieldType,
  required,
  validate,
} as FieldConfig))

/** Generate any validatable FieldConfig */
const fieldConfigArb = fc.oneof(stringFieldConfigArb, numberFieldConfigArb)

/** Generate a value appropriate for a string field type */
const stringValueArb = fc.oneof(
  fc.constant(undefined),
  fc.constant(''),
  fc.string({ minLength: 1, maxLength: 100 }),
  fc.emailAddress(),
  fc.webUrl(),
  fc.stringMatching(/^[a-z]+$/),
)

/** Generate a value appropriate for a number field type */
const numberValueArb = fc.oneof(
  fc.constant(undefined),
  fc.integer({ min: -1000, max: 1000 }),
  fc.double({ min: -1000, max: 1000, noNaN: true }),
)

/** Generate a field config paired with an appropriate value */
const fieldWithValueArb = fc.oneof(
  fc.tuple(stringFieldConfigArb, stringValueArb),
  fc.tuple(numberFieldConfigArb, numberValueArb),
)

// --- Property Tests ---

describe('Property 1: Validation Rule Enforcement', () => {
  it('produces consistent pass/fail results across repeated invocations (context independence)', () => {
    fc.assert(
      fc.property(
        handleArb,
        fieldWithValueArb,
        (handle, [fieldConfig, value]) => {
          const fields: Record<string, FieldConfig> = { [handle]: fieldConfig }
          const values: Record<string, unknown> = { [handle]: value }

          // Run validation twice to simulate different execution contexts
          const result1 = validateFields(fields, values)
          const result2 = validateFields(fields, values)

          // Same result regardless of execution context
          expect(result1.valid).toBe(result2.valid)
          expect(result1.errors).toEqual(result2.errors)
        }
      ),
      { numRuns: 100 },
    )
  })

  it('errors are keyed by the violated field handle', () => {
    fc.assert(
      fc.property(
        handleArb,
        fieldWithValueArb,
        (handle, [fieldConfig, value]) => {
          const fields: Record<string, FieldConfig> = { [handle]: fieldConfig }
          const values: Record<string, unknown> = { [handle]: value }

          const result = validateFields(fields, values)

          if (!result.valid) {
            // All error keys must correspond to field handles that were validated
            const errorKeys = Object.keys(result.errors)
            for (const key of errorKeys) {
              expect(key).toBe(handle)
            }
            // Each error must have at least one message
            for (const messages of Object.values(result.errors)) {
              expect(messages.length).toBeGreaterThan(0)
              for (const msg of messages) {
                expect(typeof msg).toBe('string')
                expect(msg.length).toBeGreaterThan(0)
              }
            }
          }
        }
      ),
      { numRuns: 100 },
    )
  })

  it('errors are keyed by violated field handle across multiple fields', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(handleArb, fieldWithValueArb), { minLength: 1, maxLength: 5 })
          .map((pairs) => {
            // Ensure unique handles
            const seen = new Set<string>()
            return pairs.filter(([h]) => {
              if (seen.has(h)) return false
              seen.add(h)
              return true
            })
          })
          .filter((pairs) => pairs.length > 0),
        (pairs) => {
          const fields: Record<string, FieldConfig> = {}
          const values: Record<string, unknown> = {}

          for (const [handle, [fieldConfig, value]] of pairs) {
            fields[handle] = fieldConfig
            values[handle] = value
          }

          const result = validateFields(fields, values)

          // Every error key must correspond to a field handle that was in the input
          const validHandles = Object.keys(fields)
          for (const errorKey of Object.keys(result.errors)) {
            expect(validHandles).toContain(errorKey)
          }

          // valid should be true iff no errors
          if (result.valid) {
            expect(Object.keys(result.errors)).toHaveLength(0)
          } else {
            expect(Object.keys(result.errors).length).toBeGreaterThan(0)
          }
        }
      ),
      { numRuns: 100 },
    )
  })

  it('deterministic: same inputs always produce same outputs', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(handleArb, fieldWithValueArb), { minLength: 1, maxLength: 4 })
          .map((pairs) => {
            const seen = new Set<string>()
            return pairs.filter(([h]) => {
              if (seen.has(h)) return false
              seen.add(h)
              return true
            })
          })
          .filter((pairs) => pairs.length > 0),
        (pairs) => {
          const fields: Record<string, FieldConfig> = {}
          const values: Record<string, unknown> = {}

          for (const [handle, [fieldConfig, value]] of pairs) {
            fields[handle] = fieldConfig
            values[handle] = value
          }

          // Run multiple times to confirm determinism (simulates client vs server)
          const results = Array.from({ length: 3 }, () => validateFields(fields, values))

          for (let i = 1; i < results.length; i++) {
            expect(results[i].valid).toBe(results[0].valid)
            expect(results[i].errors).toEqual(results[0].errors)
          }
        }
      ),
      { numRuns: 100 },
    )
  })
})
