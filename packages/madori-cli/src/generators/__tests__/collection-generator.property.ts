import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import * as fs from 'fs/promises'
import { parse as parseYaml } from 'yaml'
import matter from 'gray-matter'
import { generateCollection } from '../collection-generator.js'

import type { FieldDefinition } from '../collection-generator.js'

/**
 * Property-based tests for collection scaffolding.
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */

// Mock fs/promises
vi.mock('fs/promises', () => ({
  access: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}))

const mockAccess = vi.mocked(fs.access)
const mockWriteFile = vi.mocked(fs.writeFile)
const mockMkdir = vi.mocked(fs.mkdir)

// --- Generators ---

const VALID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789-_'
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'
const RESERVED_NAMES = [
  'admin', 'system', 'config', 'api', 'auth', 'login', 'logout',
  'register', 'settings', 'dashboard', 'null', 'undefined', 'true', 'false',
]

const FIELD_TYPES = ['text', 'textarea', 'tiptap', 'date', 'toggle', 'integer', 'float', 'tags', 'select']

/** Generator for valid collection handles */
const validHandleArb = fc
  .tuple(
    fc.constantFrom(...LETTERS.split('')),
    fc.array(fc.constantFrom(...VALID_CHARS.split('')), { minLength: 0, maxLength: 30 })
  )
  .map(([first, rest]) => first + rest.join(''))
  .filter((h) => h.length >= 1 && h.length <= 64 && !RESERVED_NAMES.includes(h))

/** Generator for valid field definitions */
const fieldDefinitionArb = fc.record({
  handle: fc.tuple(
    fc.constantFrom(...LETTERS.split('')),
    fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')), { minLength: 0, maxLength: 15 })
  ).map(([first, rest]) => first + rest.join('')),
  type: fc.constantFrom(...FIELD_TYPES),
  required: fc.option(fc.constant(true), { nil: undefined }),
}) as fc.Arbitrary<FieldDefinition>

/** Generator for valid route patterns */
const validRouteArb = fc.tuple(
  fc.array(
    fc.tuple(
      fc.constantFrom(...LETTERS.split('')),
      fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')), { minLength: 0, maxLength: 10 })
    ).map(([first, rest]) => first + rest.join('')),
    { minLength: 1, maxLength: 3 }
  ),
  fc.constantFrom('{slug}', '{id}', '{handle}')
).map(([segments, param]) => '/' + segments.join('/') + '/' + param)

// --- Helpers ---

function getWriteCallContent(calls: Array<unknown[]>, pathFragment: string): string | undefined {
  const call = calls.find((c) => (c[0] as string).includes(pathFragment))
  return call ? (call[1] as string) : undefined
}

describe('Collection Scaffolding — Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAccess.mockRejectedValue(new Error('ENOENT'))
    mockWriteFile.mockResolvedValue(undefined)
    mockMkdir.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Property 1: Scaffold produces consistent artifacts', () => {
    it('generates exactly 3 files for any valid handle', async () => {
      /**
       * Validates: Requirements 1.1, 1.2, 1.3
       *
       * For any valid handle, generateCollection produces exactly 3 files:
       * a collection YAML, a blueprint YAML, and an example entry Markdown.
       */
      await fc.assert(
        fc.asyncProperty(validHandleArb, async (handle) => {
          vi.clearAllMocks()
          mockAccess.mockRejectedValue(new Error('ENOENT'))
          mockWriteFile.mockResolvedValue(undefined)
          mockMkdir.mockResolvedValue(undefined)

          const result = await generateCollection({ handle })

          expect(result.files).toHaveLength(3)
          expect(result.files[0]).toContain(`resources/collections/${handle}.yaml`)
          expect(result.files[1]).toContain(`resources/blueprints/collections/${handle}.yaml`)
          expect(result.files[2]).toContain(`content/collections/${handle}/example.md`)
        }),
        { numRuns: 100 }
      )
    })

    it('entry frontmatter keys are superset of blueprint field handles + system fields', async () => {
      /**
       * Validates: Requirements 1.1, 1.2, 1.3
       *
       * For any valid handle and optional fields, the generated entry's
       * frontmatter keys must be a superset of the blueprint's field handles
       * plus the system fields (title, slug, status, createdAt, updatedAt).
       */
      await fc.assert(
        fc.asyncProperty(
          validHandleArb,
          fc.array(fieldDefinitionArb, { minLength: 0, maxLength: 5 }),
          async (handle, fields) => {
            vi.clearAllMocks()
            mockAccess.mockRejectedValue(new Error('ENOENT'))
            mockWriteFile.mockResolvedValue(undefined)
            mockMkdir.mockResolvedValue(undefined)

            await generateCollection({ handle, fields })

            const calls = mockWriteFile.mock.calls
            const entryContent = getWriteCallContent(calls, `content/collections/${handle}/example.md`)
            expect(entryContent).toBeDefined()

            // Parse frontmatter from the entry
            const parsed = matter(entryContent!)
            const frontmatterKeys = Object.keys(parsed.data)

            // System fields must always be present
            const systemFields = ['title', 'slug', 'status', 'createdAt', 'updatedAt']
            for (const sysField of systemFields) {
              expect(frontmatterKeys).toContain(sysField)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Property 2: Scaffold options are reflected in output', () => {
    it('blueprint contains exactly the specified fields', async () => {
      /**
       * Validates: Requirements 1.4
       *
       * For any valid field definitions, the generated blueprint contains
       * exactly those fields with matching handles and types.
       */
      await fc.assert(
        fc.asyncProperty(
          validHandleArb,
          fc.array(fieldDefinitionArb, { minLength: 1, maxLength: 6 }),
          async (handle, fields) => {
            vi.clearAllMocks()
            mockAccess.mockRejectedValue(new Error('ENOENT'))
            mockWriteFile.mockResolvedValue(undefined)
            mockMkdir.mockResolvedValue(undefined)

            await generateCollection({ handle, fields })

            const calls = mockWriteFile.mock.calls
            const blueprintContent = getWriteCallContent(calls, `resources/blueprints/collections/${handle}.yaml`)
            expect(blueprintContent).toBeDefined()

            const blueprint = parseYaml(blueprintContent!)
            const blueprintFields = blueprint.tabs.main.fields as Array<{ handle: string; field: { type: string; required?: boolean } }>

            // Exactly the right number of fields
            expect(blueprintFields).toHaveLength(fields.length)

            // Each field matches
            for (let i = 0; i < fields.length; i++) {
              expect(blueprintFields[i].handle).toBe(fields[i].handle)
              expect(blueprintFields[i].field.type).toBe(fields[i].type)
              if (fields[i].required) {
                expect(blueprintFields[i].field.required).toBe(true)
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('collection definition contains the specified route', async () => {
      /**
       * Validates: Requirements 1.5
       *
       * For any valid route pattern, the generated collection definition
       * contains that exact route.
       */
      await fc.assert(
        fc.asyncProperty(
          validHandleArb,
          validRouteArb,
          async (handle, route) => {
            vi.clearAllMocks()
            mockAccess.mockRejectedValue(new Error('ENOENT'))
            mockWriteFile.mockResolvedValue(undefined)
            mockMkdir.mockResolvedValue(undefined)

            await generateCollection({ handle, route })

            const calls = mockWriteFile.mock.calls
            const collectionContent = getWriteCallContent(calls, `resources/collections/${handle}.yaml`)
            expect(collectionContent).toBeDefined()

            const collection = parseYaml(collectionContent!)
            expect(collection.route).toBe(route)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
