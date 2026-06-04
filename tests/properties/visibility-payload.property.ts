// Feature: phase-zero-completion, Property 2: Visibility Condition Determines Payload Inclusion

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { evaluateCondition, filterPayloadByVisibility } from '@/lib/blueprints/visibility'
import type { VisibilityCondition } from '@/lib/blueprints/types'

/**
 * Validates: Requirements 4.3, 4.4
 *
 * Property: For any set of field definitions with visibility conditions and any form state,
 * a field whose visibility condition evaluates to false SHALL be excluded from the filtered
 * submission payload, and a field whose visibility condition evaluates to true SHALL be
 * included in the filtered submission payload.
 */

// --- Generators ---

/** Generates a valid field handle (simple alphanumeric identifier) */
const handleArb = fc.stringMatching(/^[a-z][a-z0-9_]{0,19}$/).filter((s) => s.length >= 1)

/** Generates one of the 5 supported visibility operators */
const operatorArb = fc.constantFrom(
  'equals' as const,
  'not_equals' as const,
  'contains' as const,
  'empty' as const,
  'not_empty' as const,
)

/** Generates a primitive value suitable for form fields */
const fieldValueArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 50 }),
  fc.integer({ min: -1000, max: 1000 }),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
)

/** Generates a non-empty string value (useful for condition values) */
const conditionValueArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 30 }),
  fc.integer({ min: -100, max: 100 }),
  fc.boolean(),
)

/** Generates a visibility condition referencing a given field */
const visibilityConditionArb = (conditionField: string): fc.Arbitrary<VisibilityCondition> =>
  fc.record({
    field: fc.constant(conditionField),
    operator: operatorArb,
    value: conditionValueArb,
  })

/**
 * Generates a test scenario with:
 * - A set of field definitions (some with visibility conditions, some without)
 * - Form values for all fields (including the fields referenced by conditions)
 */
const scenarioArb = fc
  .tuple(
    // Number of fields (2-8)
    fc.integer({ min: 2, max: 8 }),
  )
  .chain(([numFields]) => {
    // Generate unique handles
    const handlesArb = fc
      .uniqueArray(handleArb, { minLength: numFields, maxLength: numFields })
      .filter((arr) => arr.length === numFields)

    return handlesArb.chain((handles) => {
      // Pick one handle to act as the "condition field" (the field other fields depend on)
      const conditionFieldIdx = 0
      const conditionField = handles[conditionFieldIdx]

      // Generate field definitions: some with visibility, some without
      const fieldDefsArb = fc.tuple(
        ...handles.map((handle, idx) => {
          if (idx === conditionFieldIdx) {
            // The condition field itself has no visibility condition
            return fc.constant({ handle, visibility: undefined })
          }
          // Other fields: 50% chance of having a visibility condition
          return fc.boolean().chain((hasVisibility) => {
            if (!hasVisibility) {
              return fc.constant({ handle, visibility: undefined })
            }
            return visibilityConditionArb(conditionField).map((vis) => ({
              handle,
              visibility: vis,
            }))
          })
        }),
      )

      // Generate form values for all handles
      const valuesArb = fc
        .tuple(...handles.map(() => fieldValueArb))
        .map((values) => {
          const obj: Record<string, unknown> = {}
          handles.forEach((h, i) => {
            if (values[i] !== undefined) {
              obj[h] = values[i]
            }
          })
          return obj
        })

      return fc.tuple(fieldDefsArb, valuesArb).map(([fieldDefs, values]) => ({
        fields: fieldDefs as Array<{ handle: string; visibility?: VisibilityCondition }>,
        values,
      }))
    })
  })

// --- Property Tests ---

describe('Property 2: Visibility Condition Determines Payload Inclusion', () => {
  it('hidden fields (condition=false) are excluded from payload', () => {
    fc.assert(
      fc.property(scenarioArb, ({ fields, values }) => {
        const result = filterPayloadByVisibility(fields, values)

        for (const field of fields) {
          if (field.visibility) {
            const isVisible = evaluateCondition(field.visibility, values)
            if (!isVisible) {
              // Hidden field MUST NOT be in the result
              expect(result).not.toHaveProperty(field.handle)
            }
          }
        }
      }),
      { numRuns: 100 },
    )
  })

  it('visible fields (condition=true) with values are included in payload', () => {
    fc.assert(
      fc.property(scenarioArb, ({ fields, values }) => {
        const result = filterPayloadByVisibility(fields, values)

        for (const field of fields) {
          if (field.visibility) {
            const isVisible = evaluateCondition(field.visibility, values)
            if (isVisible && field.handle in values) {
              // Visible field with a value MUST be in the result
              expect(result).toHaveProperty(field.handle)
              expect(result[field.handle]).toEqual(values[field.handle])
            }
          }
        }
      }),
      { numRuns: 100 },
    )
  })

  it('fields without visibility conditions are always included when they have values', () => {
    fc.assert(
      fc.property(scenarioArb, ({ fields, values }) => {
        const result = filterPayloadByVisibility(fields, values)

        for (const field of fields) {
          if (!field.visibility && field.handle in values) {
            // No condition means always visible → must be in result
            expect(result).toHaveProperty(field.handle)
            expect(result[field.handle]).toEqual(values[field.handle])
          }
        }
      }),
      { numRuns: 100 },
    )
  })

  it('payload never contains fields that are not in the original values', () => {
    fc.assert(
      fc.property(scenarioArb, ({ fields, values }) => {
        const result = filterPayloadByVisibility(fields, values)

        // Every key in result must exist in original values
        for (const key of Object.keys(result)) {
          expect(values).toHaveProperty(key)
        }
      }),
      { numRuns: 100 },
    )
  })

  it('payload never contains fields that are not in the field definitions', () => {
    fc.assert(
      fc.property(scenarioArb, ({ fields, values }) => {
        const result = filterPayloadByVisibility(fields, values)
        const fieldHandles = new Set(fields.map((f) => f.handle))

        // Every key in result must correspond to a defined field
        for (const key of Object.keys(result)) {
          expect(fieldHandles.has(key)).toBe(true)
        }
      }),
      { numRuns: 100 },
    )
  })
})
