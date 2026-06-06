import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { TypeGenerator } from '../type-generator.js'
import type { Blueprint, BlueprintTab, BlueprintSection, FieldDefinition, FieldType } from '@madori/lib/blueprints/types.js'

/**
 * Property 3: Blueprint-to-interface cardinality and field flattening
 *
 * For any set of valid blueprints (each potentially containing multiple tabs and sections),
 * the TypeGenerator SHALL produce exactly one TypeScript interface per blueprint,
 * and that interface SHALL contain every field from all tabs and sections of the
 * source blueprint with no duplicates or omissions.
 *
 * **Validates: Requirements 1.1, 1.18**
 */

/** Simple field types that avoid complex nested content (replicator/grid) */
const SIMPLE_FIELD_TYPES: FieldType[] = [
  'text', 'slug', 'markdown', 'tiptap', 'code', 'hidden', 'date',
  'number', 'toggle', 'asset', 'entries', 'taxonomy', 'yaml',
]

/** Generate a valid field handle (lowercase alpha start, alphanumeric + underscores) */
const fieldHandleArb = fc
  .tuple(
    fc.stringMatching(/^[a-z]$/),
    fc.stringMatching(/^[a-z0-9_]{0,12}$/)
  )
  .map(([first, rest]) => first + rest)

/** Generate a simple FieldDefinition with a known simple type */
const fieldDefinitionArb = (handle: string): fc.Arbitrary<FieldDefinition> =>
  fc.record({
    handle: fc.constant(handle),
    field: fc.record({
      type: fc.constantFrom(...SIMPLE_FIELD_TYPES),
      display: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
      required: fc.option(fc.boolean(), { nil: undefined }),
    }),
  })

/** Generate an array of FieldDefinitions with unique handles */
const uniqueFieldsArb = (minLength: number, maxLength: number): fc.Arbitrary<FieldDefinition[]> =>
  fc.uniqueArray(fieldHandleArb, { minLength, maxLength })
    .chain((handles) =>
      fc.tuple(...handles.map((h) => fieldDefinitionArb(h)))
    )

/** Generate a BlueprintSection with unique fields */
const sectionArb = (handles: string[]): fc.Arbitrary<BlueprintSection> =>
  fc.tuple(...handles.map((h) => fieldDefinitionArb(h))).map((fields) => ({
    display: 'Test Section',
    fields,
  }))

/**
 * Generate a complete Blueprint with multiple tabs and sections,
 * ensuring all field handles are unique across the entire blueprint.
 */
const blueprintArb: fc.Arbitrary<Blueprint> = fc
  .record({
    handle: fc.tuple(
      fc.stringMatching(/^[a-z]$/),
      fc.stringMatching(/^[a-z0-9-]{0,10}$/)
    ).map(([first, rest]) => first + rest),
    tabCount: fc.integer({ min: 1, max: 4 }),
    fieldsPerTab: fc.integer({ min: 0, max: 4 }),
    sectionsPerTab: fc.integer({ min: 0, max: 3 }),
    fieldsPerSection: fc.integer({ min: 0, max: 3 }),
  })
  .chain(({ handle, tabCount, fieldsPerTab, sectionsPerTab, fieldsPerSection }) => {
    // Calculate total fields needed across all tabs and sections
    const totalFields = tabCount * (fieldsPerTab + sectionsPerTab * fieldsPerSection)

    // Generate enough unique handles for all fields
    return fc.uniqueArray(fieldHandleArb, { minLength: Math.max(1, totalFields), maxLength: Math.max(1, totalFields) + 5 })
      .chain((allHandles) => {
        // Distribute handles across tabs and sections
        let handleIdx = 0
        const tabNames = Array.from({ length: tabCount }, (_, i) => `tab${i}`)

        const tabArbs = tabNames.map((tabName) => {
          // Fields directly on the tab
          const tabFieldHandles = allHandles.slice(handleIdx, handleIdx + fieldsPerTab)
          handleIdx += fieldsPerTab

          // Sections within the tab
          const sectionNames = Array.from({ length: sectionsPerTab }, (_, i) => `section${i}`)
          const sectionFieldGroups = sectionNames.map(() => {
            const sectionHandles = allHandles.slice(handleIdx, handleIdx + fieldsPerSection)
            handleIdx += fieldsPerSection
            return sectionHandles
          })

          // Build section arbitraries
          const sectionsArb = sectionNames.length > 0 && fieldsPerSection > 0
            ? fc.tuple(
                ...sectionNames.map((_, i) =>
                  sectionArb(sectionFieldGroups[i])
                )
              ).map((sections) => {
                const record: Record<string, BlueprintSection> = {}
                sectionNames.forEach((name, idx) => {
                  record[name] = sections[idx]
                })
                return record
              })
            : fc.constant(undefined as Record<string, BlueprintSection> | undefined)

          // Build tab arbitrary
          return fc.tuple(
            fc.tuple(...tabFieldHandles.map((h) => fieldDefinitionArb(h))),
            sectionsArb
          ).map(([fields, sections]): [string, BlueprintTab] => [
            tabName,
            {
              display: tabName,
              fields,
              ...(sections ? { sections } : {}),
            },
          ])
        })

        return fc.tuple(...tabArbs).map((tabEntries): Blueprint => ({
          handle,
          tabs: Object.fromEntries(tabEntries),
        }))
      })
  })

/** Collect all field handles from a blueprint (from all tabs and sections) */
function collectAllFieldHandles(blueprint: Blueprint): string[] {
  const handles: string[] = []
  for (const tab of Object.values(blueprint.tabs)) {
    if (tab.fields) {
      for (const field of tab.fields) {
        handles.push(field.handle)
      }
    }
    if (tab.sections) {
      for (const section of Object.values(tab.sections)) {
        if (section.fields) {
          for (const field of section.fields) {
            handles.push(field.handle)
          }
        }
      }
    }
  }
  return handles
}

describe('TypeGenerator — Property 3: Blueprint-to-interface cardinality and field flattening', () => {
  const generator = new TypeGenerator()

  it('generates exactly one interface per blueprint (cardinality)', () => {
    fc.assert(
      fc.property(
        fc.array(blueprintArb, { minLength: 1, maxLength: 5 }).chain((blueprints) => {
          // Ensure unique blueprint handles
          const seen = new Set<string>()
          const unique = blueprints.filter((bp) => {
            if (seen.has(bp.handle)) return false
            seen.add(bp.handle)
            return true
          })
          return fc.constant(unique.length > 0 ? unique : [blueprints[0]])
        }),
        (blueprints) => {
          const result = generator.generate(blueprints)

          // Exactly one file per blueprint
          expect(result).toHaveLength(blueprints.length)

          // Each file corresponds to the correct blueprint
          for (let i = 0; i < blueprints.length; i++) {
            expect(result[i].blueprintHandle).toBe(blueprints[i].handle)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('flattens all fields from all tabs and sections into the interface (no omissions)', () => {
    fc.assert(
      fc.property(
        blueprintArb,
        (blueprint) => {
          const result = generator.generate([blueprint])
          const generatedContent = result[0].content
          const allHandles = collectAllFieldHandles(blueprint)

          // Every field handle from the blueprint must appear in the generated content
          for (const handle of allHandles) {
            expect(generatedContent).toContain(handle)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('produces no duplicate field declarations in a single interface', () => {
    fc.assert(
      fc.property(
        blueprintArb,
        (blueprint) => {
          const result = generator.generate([blueprint])
          const generatedContent = result[0].content
          const allHandles = collectAllFieldHandles(blueprint)

          // Strip JSDoc/comment blocks so we only match actual declarations
          const strippedContent = generatedContent.replace(/\/\*\*[\s\S]*?\*\//g, '')

          // Each field handle should appear exactly once as a declaration
          // (handle followed by optional ? and : pattern)
          for (const handle of allHandles) {
            const declarationPattern = new RegExp(`\\b${handle}\\??\\s*:`, 'g')
            const matches = strippedContent.match(declarationPattern)
            if (matches) {
              expect(matches.length).toBe(1)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
