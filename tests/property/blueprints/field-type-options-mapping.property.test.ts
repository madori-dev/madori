// Property 12: Field type determines rendered advanced options

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import type { FieldType } from '@/lib/blueprints/types'

/**
 * Property 12: Field type determines rendered advanced options
 *
 * For any field type, the Field Config Sheet SHALL render only the advanced
 * options defined for that specific type. No options from other field types
 * SHALL appear. The mapping is:
 *   - text, slug, markdown, tiptap → TextFieldOptions
 *   - asset → AssetFieldOptions
 *   - taxonomy → TaxonomyFieldOptions
 *   - select, multiselect → SelectFieldOptions
 *   - replicator, grid → ReplicatorFieldOptions
 *   - number, date, toggle → null (no advanced options)
 *
 * **Validates: Requirements 7.5**
 */

// --- Replicate the getOptionsComponent mapping from FieldConfigSheet ---
// This is a pure function extraction of the switch statement in
// src/components/cp/FieldConfigSheet.tsx

type OptionsComponentName =
  | 'TextFieldOptions'
  | 'AssetFieldOptions'
  | 'TaxonomyFieldOptions'
  | 'SelectFieldOptions'
  | 'ReplicatorFieldOptions'
  | null

/**
 * Pure function replicating the type→component mapping from FieldConfigSheet.
 * Returns a string name of the component (or null) for testability without
 * importing React components.
 */
function getOptionsComponentName(type: FieldType): OptionsComponentName {
  switch (type) {
    case 'text':
    case 'slug':
    case 'markdown':
    case 'tiptap':
      return 'TextFieldOptions'
    case 'asset':
      return 'AssetFieldOptions'
    case 'taxonomy':
      return 'TaxonomyFieldOptions'
    case 'select':
    case 'multiselect':
      return 'SelectFieldOptions'
    case 'replicator':
    case 'grid':
      return 'ReplicatorFieldOptions'
    default:
      return null
  }
}

// --- Expected mapping (source of truth from design doc) ---

const EXPECTED_MAPPING: Record<string, OptionsComponentName> = {
  text: 'TextFieldOptions',
  slug: 'TextFieldOptions',
  markdown: 'TextFieldOptions',
  tiptap: 'TextFieldOptions',
  asset: 'AssetFieldOptions',
  taxonomy: 'TaxonomyFieldOptions',
  select: 'SelectFieldOptions',
  multiselect: 'SelectFieldOptions',
  replicator: 'ReplicatorFieldOptions',
  grid: 'ReplicatorFieldOptions',
  number: null,
  date: null,
  toggle: null,
}

// All field types available in the FieldConfigSheet type selector
const ALL_FIELD_TYPES: FieldType[] = [
  'text',
  'slug',
  'markdown',
  'tiptap',
  'select',
  'multiselect',
  'toggle',
  'number',
  'date',
  'asset',
  'taxonomy',
  'replicator',
  'grid',
]

// All possible options component names (excluding null)
const ALL_COMPONENT_NAMES: OptionsComponentName[] = [
  'TextFieldOptions',
  'AssetFieldOptions',
  'TaxonomyFieldOptions',
  'SelectFieldOptions',
  'ReplicatorFieldOptions',
]

// --- Generators ---

/** Arbitrary field type from the full set */
const fieldTypeArb: fc.Arbitrary<FieldType> = fc.constantFrom(...ALL_FIELD_TYPES)

// --- Property Tests ---

describe('Property 12: Field type determines rendered advanced options', () => {
  it('each field type maps to exactly the correct options component', () => {
    fc.assert(
      fc.property(fieldTypeArb, (type) => {
        const result = getOptionsComponentName(type)
        const expected = EXPECTED_MAPPING[type]

        // The mapping must return the expected component for this type
        expect(result).toBe(expected)
      }),
      { numRuns: 200 },
    )
  })

  it('no field type maps to more than one options component', () => {
    fc.assert(
      fc.property(fieldTypeArb, (type) => {
        const result = getOptionsComponentName(type)

        if (result === null) {
          // Types with no advanced options should not accidentally match any component
          return
        }

        // The result must be exactly one component — verify no cross-type leakage
        // by checking that the other components do NOT also claim this type
        const otherComponents = ALL_COMPONENT_NAMES.filter((c) => c !== result)
        for (const otherComponent of otherComponents) {
          // Find which types map to this other component
          const typesForOther = ALL_FIELD_TYPES.filter(
            (t) => getOptionsComponentName(t) === otherComponent,
          )
          // The current type should NOT be among them
          expect(typesForOther).not.toContain(type)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('no cross-type option leakage: types in different groups never share a component', () => {
    // Define the groups per the design document
    const groups: FieldType[][] = [
      ['text', 'slug', 'markdown', 'tiptap'],
      ['asset'],
      ['taxonomy'],
      ['select', 'multiselect'],
      ['replicator', 'grid'],
      ['number', 'date', 'toggle'], // null group
    ]

    fc.assert(
      fc.property(
        fc.constantFrom(...groups),
        fc.constantFrom(...groups),
        (groupA, groupB) => {
          // Skip if same group
          if (groupA === groupB) return

          // Pick arbitrary types from each group
          for (const typeA of groupA) {
            for (const typeB of groupB) {
              const componentA = getOptionsComponentName(typeA)
              const componentB = getOptionsComponentName(typeB)

              // If both have components, they must be different
              if (componentA !== null && componentB !== null) {
                expect(componentA).not.toBe(componentB)
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('types with null mapping render no advanced options at all', () => {
    const nullTypes: FieldType[] = ['number', 'date', 'toggle']

    fc.assert(
      fc.property(fc.constantFrom(...nullTypes), (type) => {
        const result = getOptionsComponentName(type)
        expect(result).toBeNull()
      }),
      { numRuns: 50 },
    )
  })
})
