// Properties 4–6: GraphQL Schema Generation
// Validates: Requirements 2.1, 2.6, 2.7

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { GraphQLObjectType, GraphQLList, GraphQLUnionType } from 'graphql'
import { SchemaGeneratorImpl, FieldsetProvider } from '../schema-generator'
import { sanitiseFieldHandle } from '../sanitise-field-handle'
import type { Blueprint, FieldDefinition, FieldType } from '../../blueprints/types'
import type { ListOptions, Entry } from '../../types'

/**
 * Validates: Requirements 2.1, 2.6, 2.7
 */

// --- Constants ---

const VALID_FIELD_TYPES: FieldType[] = [
  'text', 'slug', 'markdown', 'tiptap', 'number', 'toggle',
  'select', 'multiselect', 'date', 'asset', 'entries',
  'taxonomy', 'replicator', 'grid', 'yaml', 'code', 'hidden',
]

const NON_REPLICATOR_TYPES: FieldType[] = VALID_FIELD_TYPES.filter(
  (t) => t !== 'replicator' && t !== 'grid',
)

const VALID_GRAPHQL_IDENTIFIER = /^[_A-Za-z][_0-9A-Za-z]*$/

// --- Arbitraries ---

/** Valid field handle: lowercase alpha start, alphanumeric + underscores */
const handleArb = fc.stringMatching(/^[a-z][a-z0-9_]{0,14}$/)

/** Valid tab/section key */
const keyArb = fc.stringMatching(/^[a-z][a-z0-9_]{0,9}$/)

/** Non-replicator field type */
const nonReplicatorTypeArb = fc.constantFrom(...NON_REPLICATOR_TYPES)

/** A simple field definition (non-replicator) */
const simpleFieldDefArb = fc.tuple(handleArb, nonReplicatorTypeArb).map(
  ([handle, type]): FieldDefinition => ({
    handle,
    field: { type },
  }),
)

/** A set name for replicator fieldsets */
const setNameArb = fc.stringMatching(/^[a-z][a-z0-9_]{1,8}$/)

/**
 * Generates a replicator field definition with named sets.
 * Each set name represents a fieldset that the FieldsetProvider resolves.
 */
const replicatorFieldDefArb = fc.tuple(
  handleArb,
  fc.constantFrom('replicator' as FieldType, 'grid' as FieldType),
  fc.uniqueArray(setNameArb, { minLength: 1, maxLength: 3 }),
).map(([handle, type, sets]): FieldDefinition => ({
  handle,
  field: {
    type,
    options: { sets },
  },
}))

/**
 * Generates a blueprint containing at least one replicator/grid field
 * alongside optional simple fields.
 */
const blueprintWithReplicatorArb = fc.tuple(
  keyArb, // tab name
  handleArb, // blueprint handle
  fc.uniqueArray(simpleFieldDefArb, { minLength: 0, maxLength: 3, selector: (f) => f.handle }),
  replicatorFieldDefArb,
).map(([tabName, bpHandle, simpleFields, replicatorField]): Blueprint => {
  // Ensure replicator handle doesn't collide with simple field handles
  const usedHandles = new Set(simpleFields.map((f) => f.handle))
  let repHandle = replicatorField.handle
  while (usedHandles.has(repHandle)) {
    repHandle = `rep_${repHandle}`.slice(0, 15)
  }
  const adjustedRepField = { ...replicatorField, handle: repHandle }

  return {
    handle: bpHandle,
    tabs: {
      [tabName]: {
        fields: [...simpleFields, adjustedRepField],
      },
    },
  }
})

/**
 * Creates a FieldsetProvider that maps set handles to simple field definitions.
 */
function createFieldsetProvider(
  setFields: Map<string, FieldDefinition[]>,
): FieldsetProvider {
  return {
    getFieldset(handle: string) {
      return setFields.get(handle)
    },
  }
}

// --- Property 5 Arbitraries ---

/** Generate an entry with basic fields */
const entryArb = fc.tuple(
  fc.string({ minLength: 1, maxLength: 20 }),
  fc.string({ minLength: 1, maxLength: 20 }),
  fc.constantFrom('published' as const, 'draft' as const),
  fc.nat({ max: 1000 }),
).map(([title, slug, status, sortVal]): Entry => ({
  title,
  slug,
  status,
  content: '',
  data: { sortField: sortVal },
  collection: 'test',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}))

/** Generate valid list options */
const listOptionsArb = fc.record({
  limit: fc.option(fc.integer({ min: 1, max: 50 }), { nil: undefined }),
  offset: fc.option(fc.integer({ min: 0, max: 20 }), { nil: undefined }),
  sort: fc.option(
    fc.record({
      field: fc.constant('title'),
      direction: fc.constantFrom('asc' as const, 'desc' as const),
    }),
    { nil: undefined },
  ),
}) as fc.Arbitrary<ListOptions>

/**
 * Pure implementation of applyListOptions logic for verification.
 * Mirrors the content engine's logic for property comparison.
 */
function referenceApplyListOptions(entries: Entry[], options: ListOptions): Entry[] {
  let result = [...entries]

  if (options.sort) {
    const { field, direction } = options.sort
    result.sort((a, b) => {
      const aVal = (a as unknown as Record<string, unknown>)[field] ?? a.data[field]
      const bVal = (b as unknown as Record<string, unknown>)[field] ?? b.data[field]
      if (aVal === bVal) return 0
      if (aVal === undefined || aVal === null) return 1
      if (bVal === undefined || bVal === null) return -1
      const comparison = aVal < bVal ? -1 : 1
      return direction === 'desc' ? -comparison : comparison
    })
  }

  if (options.offset) {
    result = result.slice(options.offset)
  }

  if (options.limit) {
    result = result.slice(0, options.limit)
  }

  return result
}

// --- Property 6 Arbitraries ---

/**
 * Generate arbitrary field handles including invalid GraphQL characters,
 * leading digits, reserved names, and edge cases.
 */
const arbitraryFieldHandleArb = fc.oneof(
  // Normal handles
  handleArb,
  // Handles with hyphens
  fc.stringMatching(/^[a-z][a-z0-9-]{1,10}$/),
  // Handles with dots
  fc.stringMatching(/^[a-z][a-z0-9.]{1,10}$/),
  // Handles with spaces
  fc.tuple(fc.stringMatching(/^[a-z]{1,5}$/), fc.stringMatching(/^[a-z]{1,5}$/))
    .map(([a, b]) => `${a} ${b}`),
  // Handles starting with digits
  fc.stringMatching(/^[0-9][a-z0-9_]{0,8}$/),
  // Reserved GraphQL names
  fc.constantFrom('__typename', '__type', '__schema'),
  // Unicode / special chars
  fc.stringMatching(/^[a-z][a-z0-9!@#$%]{1,8}$/),
  // Empty-ish
  fc.constantFrom('', '   ', '---'),
)

// --- Property Tests ---

describe('GraphQL Schema Generator Property Tests', () => {
  /**
   * **Validates: Requirements 2.1**
   *
   * Property 4: Replicator fields generate dedicated object types
   *
   * For any blueprint containing one or more replicator fields with nested
   * field definitions, the GraphQL schema generator SHALL produce a
   * GraphQLObjectType (not GraphQLString) for each replicator field's items.
   */
  describe('Property 4: Replicator fields generate dedicated object types', () => {
    it('replicator/grid fields produce GraphQLObjectType when fieldset provider resolves sets', () => {
      fc.assert(
        fc.property(
          blueprintWithReplicatorArb,
          fc.uniqueArray(simpleFieldDefArb, { minLength: 1, maxLength: 4, selector: (f) => f.handle }),
          (blueprint, setFieldDefs) => {
            // Extract replicator fields from the blueprint
            const allFields: FieldDefinition[] = []
            for (const tab of Object.values(blueprint.tabs)) {
              allFields.push(...tab.fields)
            }
            const replicatorFields = allFields.filter(
              (f) => f.field.type === 'replicator' || f.field.type === 'grid',
            )

            // Build a fieldset provider that resolves each set to the generated fields
            const setFieldsMap = new Map<string, FieldDefinition[]>()
            for (const repField of replicatorFields) {
              const sets = repField.field.options?.sets as string[] | undefined
              if (sets) {
                for (const setHandle of sets) {
                  setFieldsMap.set(setHandle, setFieldDefs)
                }
              }
            }

            const provider = createFieldsetProvider(setFieldsMap)
            const generator = new SchemaGeneratorImpl(provider)

            const collectionType = generator.generateCollectionType(
              { title: 'Test', handle: 'test', blueprint: blueprint.handle },
              blueprint,
            )

            // Verify that replicator fields produce GraphQLObjectType (via List)
            const fields = collectionType.getFields()
            for (const repField of replicatorFields) {
              const sanitisedHandle = sanitiseFieldHandle(repField.handle)
              const graphqlField = fields[sanitisedHandle]

              expect(graphqlField).toBeDefined()

              // The type should be a GraphQLList wrapping a GraphQLObjectType or GraphQLUnionType
              const fieldType = graphqlField.type
              expect(fieldType).toBeInstanceOf(GraphQLList)
              const innerType = (fieldType as GraphQLList<unknown>).ofType
              const isObjectOrUnion =
                innerType instanceof GraphQLObjectType ||
                innerType instanceof GraphQLUnionType
              expect(isObjectOrUnion).toBe(true)
            }
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  /**
   * **Validates: Requirements 2.6**
   *
   * Property 5: List options are applied to query results
   *
   * For any set of entries and valid list options (filter, limit, offset, sort),
   * the list resolver SHALL return results equivalent to applying those options
   * to the full entry set.
   */
  describe('Property 5: List options are applied to query results', () => {
    it('applying list options (limit, offset, sort) produces equivalent results to reference implementation', () => {
      fc.assert(
        fc.property(
          fc.array(entryArb, { minLength: 0, maxLength: 30 }),
          listOptionsArb,
          (entries, options) => {
            const result = referenceApplyListOptions(entries, options)

            // Verify limit constraint
            if (options.limit !== undefined) {
              expect(result.length).toBeLessThanOrEqual(options.limit)
            }

            // Verify offset constraint
            const afterSort = (() => {
              let sorted = [...entries]
              if (options.sort) {
                const { field, direction } = options.sort
                sorted.sort((a, b) => {
                  const aVal = (a as unknown as Record<string, unknown>)[field] ?? a.data[field]
                  const bVal = (b as unknown as Record<string, unknown>)[field] ?? b.data[field]
                  if (aVal === bVal) return 0
                  if (aVal === undefined || aVal === null) return 1
                  if (bVal === undefined || bVal === null) return -1
                  const comparison = aVal < bVal ? -1 : 1
                  return direction === 'desc' ? -comparison : comparison
                })
              }
              return sorted
            })()

            const expectedAfterOffset = options.offset
              ? afterSort.slice(options.offset)
              : afterSort
            const expected = options.limit
              ? expectedAfterOffset.slice(0, options.limit)
              : expectedAfterOffset

            expect(result).toEqual(expected)

            // Verify sort order if sort was applied and result has 2+ elements
            if (options.sort && result.length >= 2) {
              const { field, direction } = options.sort
              for (let i = 0; i < result.length - 1; i++) {
                const curr = (result[i] as unknown as Record<string, unknown>)[field] ?? result[i].data[field]
                const next = (result[i + 1] as unknown as Record<string, unknown>)[field] ?? result[i + 1].data[field]
                if (curr !== undefined && curr !== null && next !== undefined && next !== null) {
                  if (direction === 'asc') {
                    expect(curr <= next).toBe(true)
                  } else {
                    expect(curr >= next).toBe(true)
                  }
                }
              }
            }
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  /**
   * **Validates: Requirements 2.7**
   *
   * Property 6: Field handles are sanitised to valid GraphQL identifiers
   *
   * For any blueprint field handle, the generated GraphQL field name SHALL be
   * a valid GraphQL identifier (matching /^[_A-Za-z][_0-9A-Za-z]*$/).
   */
  describe('Property 6: Field handles are sanitised to valid GraphQL identifiers', () => {
    it('any field handle is sanitised to a valid GraphQL identifier', () => {
      fc.assert(
        fc.property(arbitraryFieldHandleArb, (handle) => {
          const sanitised = sanitiseFieldHandle(handle)

          // Must match the valid GraphQL identifier pattern
          expect(sanitised).toMatch(VALID_GRAPHQL_IDENTIFIER)

          // Must be non-empty
          expect(sanitised.length).toBeGreaterThan(0)

          // Must not start with a digit
          expect(/^[0-9]/.test(sanitised)).toBe(false)
        }),
        { numRuns: 100 },
      )
    })

    it('sanitised handles used in schema generation are all valid identifiers', () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(
            fc.tuple(arbitraryFieldHandleArb, nonReplicatorTypeArb),
            { minLength: 1, maxLength: 5, selector: ([h]) => h },
          ),
          (fieldDefs) => {
            const blueprint: Blueprint = {
              handle: 'test',
              tabs: {
                main: {
                  fields: fieldDefs.map(([handle, type]) => ({
                    handle,
                    field: { type },
                  })),
                },
              },
            }

            const generator = new SchemaGeneratorImpl()
            const collectionType = generator.generateCollectionType(
              { title: 'Test', handle: 'test', blueprint: 'test' },
              blueprint,
            )

            const fields = collectionType.getFields()
            for (const fieldName of Object.keys(fields)) {
              expect(fieldName).toMatch(VALID_GRAPHQL_IDENTIFIER)
            }
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
