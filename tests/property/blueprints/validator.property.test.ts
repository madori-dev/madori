// Properties 1–3: Blueprint Validator
// Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.6

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { BlueprintValidator } from '@/lib/blueprints/validator'

/**
 * Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.6
 */

// --- Constants ---

const VALID_FIELD_TYPES = [
  'text', 'slug', 'markdown', 'tiptap', 'number', 'toggle',
  'select', 'multiselect', 'date', 'asset', 'entries',
  'taxonomy', 'replicator', 'grid', 'yaml', 'code', 'hidden',
] as const

const VALID_RULE_NAMES = [
  'required', 'min', 'max', 'regex', 'url', 'email', 'numeric_range',
] as const

const VISIBILITY_OPERATORS = [
  'equals', 'not_equals', 'contains', 'empty', 'not_empty',
] as const

// --- Arbitraries ---

/** Valid field handle: lowercase alpha start, alphanumeric + underscores */
const handleArb = fc.stringMatching(/^[a-z][a-z0-9_]{0,14}$/)

/** Valid tab/section key */
const keyArb = fc.stringMatching(/^[a-z][a-z0-9_]{0,9}$/)

/** Valid field type */
const fieldTypeArb = fc.constantFrom(...VALID_FIELD_TYPES)

/** Valid rule name, optionally with a colon-delimited parameter */
const validRuleArb = fc.constantFrom(...VALID_RULE_NAMES).chain((rule) =>
  fc.oneof(
    fc.constant(rule),
    fc.nat({ max: 999 }).map((n) => `${rule}:${n}`),
  ),
)

/** A well-formed field definition (no visibility) */
const validFieldDefArb = fc.tuple(handleArb, fieldTypeArb, fc.option(fc.array(validRuleArb, { minLength: 1, maxLength: 3 }), { nil: undefined })).map(
  ([handle, type, validate]) => ({
    handle,
    field: {
      type,
      ...(validate ? { validate } : {}),
    },
  }),
)

/**
 * Generates a well-formed blueprint with unique handles and valid types/rules.
 * Visibility conditions (if present) reference handles within the same blueprint.
 */
const validBlueprintArb: fc.Arbitrary<Record<string, unknown>> = fc
  .tuple(
    fc.integer({ min: 1, max: 3 }), // tab count
  )
  .chain(([numTabs]) =>
    fc.tuple(
      fc.uniqueArray(keyArb, { minLength: numTabs, maxLength: numTabs }),
      fc.array(
        fc.tuple(
          fc.uniqueArray(validFieldDefArb, {
            minLength: 1,
            maxLength: 5,
            selector: (f) => f.handle,
          }),
          // optional section
          fc.option(
            fc.tuple(
              keyArb,
              fc.uniqueArray(validFieldDefArb, {
                minLength: 1,
                maxLength: 3,
                selector: (f) => f.handle,
              }),
            ),
            { nil: undefined },
          ),
        ),
        { minLength: numTabs, maxLength: numTabs },
      ),
    ),
  )
  .map(([tabNames, tabData]) => {
    const usedHandles = new Set<string>()
    const tabs: Record<string, unknown> = {}

    for (let i = 0; i < tabNames.length; i++) {
      const [rawFields, sectionData] = tabData[i]

      const tabFields = rawFields.filter((f) => {
        if (usedHandles.has(f.handle)) return false
        usedHandles.add(f.handle)
        return true
      })

      const tab: Record<string, unknown> = { fields: tabFields }

      if (sectionData) {
        const [sectionName, rawSectionFields] = sectionData
        const sectionFields = rawSectionFields.filter((f) => {
          if (usedHandles.has(f.handle)) return false
          usedHandles.add(f.handle)
          return true
        })
        if (sectionFields.length > 0) {
          tab.sections = { [sectionName]: { fields: sectionFields } }
        }
      }

      tabs[tabNames[i]] = tab
    }

    return { tabs }
  })
  .filter((bp) => {
    // Ensure at least one field exists
    const tabs = bp.tabs as Record<string, { fields: unknown[] }>
    return Object.values(tabs).some((t) => (t.fields?.length ?? 0) > 0)
  })

// --- Invalid blueprint arbitraries ---

/** Invalid field types: strings that are NOT in the valid set */
const invalidFieldTypeArb = fc.stringMatching(/^[a-z]{3,12}$/).filter(
  (s) => !(VALID_FIELD_TYPES as readonly string[]).includes(s),
)

/** Invalid rule names: strings that are NOT in the valid set */
const invalidRuleArb = fc.stringMatching(/^[a-z_]{3,12}$/).filter(
  (s) => !(VALID_RULE_NAMES as readonly string[]).includes(s),
)

/** Generate a blueprint with ONE injected invalid field type */
const blueprintWithInvalidTypeArb = fc.tuple(validBlueprintArb, invalidFieldTypeArb).map(
  ([bp, badType]) => {
    const tabs = bp.tabs as Record<string, { fields: Array<{ handle: string; field: { type: string } }> }>
    const tabKeys = Object.keys(tabs)
    // Inject bad type into the first field of the first tab
    const firstTab = tabs[tabKeys[0]]
    if (firstTab.fields.length > 0) {
      firstTab.fields[0] = {
        ...firstTab.fields[0],
        field: { ...firstTab.fields[0].field, type: badType },
      }
    }
    return { tabs, _defect: 'INVALID_TYPE' as const }
  },
)

/** Generate a blueprint with ONE unknown validation rule */
const blueprintWithUnknownRuleArb = fc.tuple(validBlueprintArb, invalidRuleArb).map(
  ([bp, badRule]) => {
    const tabs = bp.tabs as Record<string, { fields: Array<{ handle: string; field: Record<string, unknown> }> }>
    const tabKeys = Object.keys(tabs)
    const firstTab = tabs[tabKeys[0]]
    if (firstTab.fields.length > 0) {
      firstTab.fields[0] = {
        ...firstTab.fields[0],
        field: { ...firstTab.fields[0].field, validate: [badRule] },
      }
    }
    return { tabs, _defect: 'UNKNOWN_RULE' as const }
  },
)

/** Generate a blueprint with duplicate field handles */
const blueprintWithDuplicateHandleArb = validBlueprintArb.chain((bp) => {
  const tabs = bp.tabs as Record<string, { fields: Array<{ handle: string; field: Record<string, unknown> }> }>
  const tabKeys = Object.keys(tabs)
  const firstTab = tabs[tabKeys[0]]

  if (firstTab.fields.length === 0) {
    // Add a duplicate field
    return fc.constant(bp).map(() => ({ tabs: bp.tabs, _defect: 'DUPLICATE_HANDLE' as const }))
  }

  // Duplicate the first field's handle in a new field
  const dupHandle = firstTab.fields[0].handle
  return fc.constantFrom(...VALID_FIELD_TYPES).map((type) => {
    firstTab.fields.push({
      handle: dupHandle,
      field: { type },
    })
    return { tabs, _defect: 'DUPLICATE_HANDLE' as const }
  })
})



// --- Dangling visibility arbitrary ---

/**
 * Generate a valid blueprint then add a visibility condition referencing
 * a handle NOT present in the blueprint.
 */
const blueprintWithDanglingVisibilityArb = fc.tuple(
  validBlueprintArb,
  fc.stringMatching(/^nonexistent_[a-z]{3,8}$/),
  fc.constantFrom(...VISIBILITY_OPERATORS),
).map(([bp, danglingRef, operator]) => {
  const tabs = bp.tabs as Record<string, { fields: Array<{ handle: string; field: Record<string, unknown> }> }>
  const tabKeys = Object.keys(tabs)
  const firstTab = tabs[tabKeys[0]]

  if (firstTab.fields.length > 0) {
    firstTab.fields[0] = {
      ...firstTab.fields[0],
      field: {
        ...firstTab.fields[0].field,
        visibility: { field: danglingRef, operator },
      },
    }
  }

  return { tabs, _danglingRef: danglingRef }
})

// --- Property Tests ---

describe('Blueprint Validator Property Tests', () => {
  const validator = new BlueprintValidator()

  /**
   * **Validates: Requirements 1.1**
   *
   * Property 1: Valid blueprints pass validation
   *
   * For any well-formed blueprint object conforming to the Blueprint type
   * (valid FieldType values, valid rule names, unique handles, existing
   * visibility targets), the Blueprint Validator SHALL return a successful
   * result with no errors.
   */
  describe('Property 1: Valid blueprints pass validation', () => {
    it('any well-formed blueprint passes validation with no errors', () => {
      fc.assert(
        fc.property(validBlueprintArb, (blueprint) => {
          const result = validator.validate(blueprint)

          expect(result.success).toBe(true)
          expect(result.errors).toHaveLength(0)
        }),
        { numRuns: 100 },
      )
    })
  })

  /**
   * **Validates: Requirements 1.2, 1.3, 1.6**
   *
   * Property 2: Invalid blueprints are rejected
   *
   * For any blueprint object containing at least one structural defect
   * (unknown field type, unknown validation rule name, or duplicate field
   * handle), the Blueprint Validator SHALL return a failed result
   * identifying the specific error.
   */
  describe('Property 2: Invalid blueprints are rejected', () => {
    it('blueprints with an invalid field type are rejected with INVALID_TYPE', () => {
      fc.assert(
        fc.property(blueprintWithInvalidTypeArb, (input) => {
          const { _defect, ...blueprint } = input
          const result = validator.validate(blueprint)

          expect(result.success).toBe(false)
          expect(result.errors.length).toBeGreaterThan(0)
          expect(result.errors.some((e) => e.code === 'INVALID_TYPE')).toBe(true)
        }),
        { numRuns: 100 },
      )
    })

    it('blueprints with an unknown validation rule are rejected with UNKNOWN_RULE', () => {
      fc.assert(
        fc.property(blueprintWithUnknownRuleArb, (input) => {
          const { _defect, ...blueprint } = input
          const result = validator.validate(blueprint)

          expect(result.success).toBe(false)
          expect(result.errors.length).toBeGreaterThan(0)
          expect(result.errors.some((e) => e.code === 'UNKNOWN_RULE')).toBe(true)
        }),
        { numRuns: 100 },
      )
    })

    it('blueprints with duplicate field handles are rejected with DUPLICATE_HANDLE', () => {
      fc.assert(
        fc.property(blueprintWithDuplicateHandleArb, (input) => {
          const { _defect, ...blueprint } = input
          const result = validator.validate(blueprint)

          expect(result.success).toBe(false)
          expect(result.errors.length).toBeGreaterThan(0)
          expect(result.errors.some((e) => e.code === 'DUPLICATE_HANDLE')).toBe(true)
        }),
        { numRuns: 100 },
      )
    })
  })

  /**
   * **Validates: Requirements 1.5**
   *
   * Property 3: Dangling visibility references produce warnings
   *
   * For any blueprint containing a visibility condition whose `field` value
   * is not present in the set of all field handles within that blueprint,
   * the Blueprint Validator SHALL include a warning identifying the
   * dangling reference.
   */
  describe('Property 3: Dangling visibility references produce warnings', () => {
    it('visibility referencing a non-existent handle produces DANGLING_VISIBILITY_REF warning', () => {
      fc.assert(
        fc.property(blueprintWithDanglingVisibilityArb, (input) => {
          const { _danglingRef, ...blueprint } = input
          const result = validator.validate(blueprint)

          // Blueprint may still be valid structurally (visibility is a warning, not error)
          expect(result.warnings.length).toBeGreaterThan(0)
          expect(
            result.warnings.some((w) => w.code === 'DANGLING_VISIBILITY_REF'),
          ).toBe(true)
          // The warning should mention the dangling reference
          expect(
            result.warnings.some((w) => w.message.includes(_danglingRef)),
          ).toBe(true)
        }),
        { numRuns: 100 },
      )
    })
  })
})
