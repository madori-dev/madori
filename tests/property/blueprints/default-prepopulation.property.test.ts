// Property 3: Blueprint Default Value Pre-population

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { getDefaultsFromBlueprint, getAllFields } from '@/lib/blueprints/defaults'
import type { Blueprint, FieldType, FieldDefinition, BlueprintTab } from '@/lib/blueprints/types'

/**
 * Validates: Requirements 4.5
 *
 * Property: For any blueprint with fields that define default values, the initial
 * form state generated for a create operation SHALL contain those default values
 * at the corresponding field handles.
 */

// --- Generators ---

/** All supported field types */
const fieldTypes: FieldType[] = [
  'text', 'slug', 'markdown', 'tiptap', 'number', 'toggle', 'select',
  'multiselect', 'date', 'asset', 'entries', 'taxonomy', 'replicator',
  'grid', 'yaml', 'code', 'hidden',
]

/** Arbitrary field type */
const fieldTypeArb = fc.constantFrom(...fieldTypes)

/** Arbitrary valid field handle */
const handleArb = fc.stringMatching(/^[a-z][a-z0-9_]{1,15}$/)

/** Arbitrary default value appropriate for various field types */
const defaultValueArb = fc.oneof(
  fc.string({ minLength: 1, maxLength: 50 }),
  fc.integer({ min: -1000, max: 1000 }),
  fc.boolean(),
  fc.constant(0),
  fc.constant(''),
  fc.constant(false),
  fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 1, maxLength: 3 }),
)

/** Generates a field definition WITH a default value */
const fieldWithDefaultArb = fc.tuple(handleArb, fieldTypeArb, defaultValueArb).map(
  ([handle, type, defaultVal]): FieldDefinition => ({
    handle,
    field: {
      type,
      default: defaultVal,
    },
  }),
)

/** Generates a field definition WITHOUT a default value */
const fieldWithoutDefaultArb = fc.tuple(handleArb, fieldTypeArb).map(
  ([handle, type]): FieldDefinition => ({
    handle,
    field: { type },
  }),
)

/** Generates an arbitrary field definition (may or may not have a default) */
const fieldDefArb = fc.oneof(
  { weight: 3, arbitrary: fieldWithDefaultArb },
  { weight: 1, arbitrary: fieldWithoutDefaultArb },
)

/** Generates a blueprint tab name */
const tabNameArb = fc.stringMatching(/^[a-z][a-z0-9_]{1,10}$/)

/** Generates a section name */
const sectionNameArb = fc.stringMatching(/^[a-z][a-z0-9_]{1,10}$/)

/**
 * Generates a blueprint with unique field handles across all tabs and sections.
 * Fields can be placed at the tab level or within sections.
 */
const blueprintArb: fc.Arbitrary<Blueprint> = fc
  .tuple(
    handleArb,
    fc.integer({ min: 1, max: 3 }), // number of tabs
  )
  .chain(([bpHandle, numTabs]) =>
    fc.tuple(
      fc.constant(bpHandle),
      fc.uniqueArray(tabNameArb, { minLength: numTabs, maxLength: numTabs }),
      // Generate fields for each tab (1-5 fields per tab)
      fc.array(
        fc.tuple(
          fc.array(fieldDefArb, { minLength: 1, maxLength: 5 }),
          // Optionally generate a section with additional fields
          fc.option(
            fc.tuple(
              sectionNameArb,
              fc.array(fieldDefArb, { minLength: 1, maxLength: 3 }),
            ),
            { nil: undefined },
          ),
        ),
        { minLength: numTabs, maxLength: numTabs },
      ),
    ),
  )
  .map(([bpHandle, tabNames, tabData]) => {
    const usedHandles = new Set<string>()
    const tabs: Record<string, BlueprintTab> = {}

    for (let i = 0; i < tabNames.length; i++) {
      const [rawFields, sectionData] = tabData[i]

      // Deduplicate field handles globally
      const tabFields = rawFields.filter((f) => {
        if (usedHandles.has(f.handle)) return false
        usedHandles.add(f.handle)
        return true
      })

      const tab: BlueprintTab = { fields: tabFields }

      if (sectionData) {
        const [sectionName, rawSectionFields] = sectionData
        const sectionFields = rawSectionFields.filter((f) => {
          if (usedHandles.has(f.handle)) return false
          usedHandles.add(f.handle)
          return true
        })
        if (sectionFields.length > 0) {
          tab.sections = {
            [sectionName]: { fields: sectionFields },
          }
        }
      }

      tabs[tabNames[i]] = tab
    }

    return { handle: bpHandle, tabs } as Blueprint
  })
  .filter((bp) => getAllFields(bp).length > 0)

// --- Property Tests ---

describe('Property 3: Blueprint Default Value Pre-population', () => {
  it('initial form state contains default values at corresponding field handles', () => {
    fc.assert(
      fc.property(blueprintArb, (blueprint) => {
        const defaults = getDefaultsFromBlueprint(blueprint)
        const allFields = getAllFields(blueprint)

        for (const fieldDef of allFields) {
          if (fieldDef.field.default !== undefined) {
            // Field with a default MUST appear in the defaults at its handle
            expect(defaults).toHaveProperty(fieldDef.handle)
            expect(defaults[fieldDef.handle]).toEqual(fieldDef.field.default)
          }
        }
      }),
      { numRuns: 100 },
    )
  })

  it('fields without defaults are NOT present in the initial form state', () => {
    fc.assert(
      fc.property(blueprintArb, (blueprint) => {
        const defaults = getDefaultsFromBlueprint(blueprint)
        const allFields = getAllFields(blueprint)

        for (const fieldDef of allFields) {
          if (fieldDef.field.default === undefined) {
            // Field without a default MUST NOT appear in the defaults
            expect(defaults).not.toHaveProperty(fieldDef.handle)
          }
        }
      }),
      { numRuns: 100 },
    )
  })

  it('defaults object only contains keys from the blueprint field handles', () => {
    fc.assert(
      fc.property(blueprintArb, (blueprint) => {
        const defaults = getDefaultsFromBlueprint(blueprint)
        const allFields = getAllFields(blueprint)
        const validHandles = new Set(allFields.map((f) => f.handle))

        // Every key in defaults must correspond to a field handle in the blueprint
        for (const key of Object.keys(defaults)) {
          expect(validHandles.has(key)).toBe(true)
        }
      }),
      { numRuns: 100 },
    )
  })

  it('number of default entries equals number of fields with defined defaults', () => {
    fc.assert(
      fc.property(blueprintArb, (blueprint) => {
        const defaults = getDefaultsFromBlueprint(blueprint)
        const allFields = getAllFields(blueprint)

        const fieldsWithDefaults = allFields.filter(
          (f) => f.field.default !== undefined,
        )

        expect(Object.keys(defaults)).toHaveLength(fieldsWithDefaults.length)
      }),
      { numRuns: 100 },
    )
  })
})
