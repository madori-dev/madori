// Feature: project-madori, Property 2: Fieldset Composition Correctness

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { FieldsetResolver } from '@/lib/blueprints/fieldsets'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { Blueprint, FieldDefinition, FieldType } from '@/lib/blueprints/types'

/**
 * Validates: Requirements 7.2
 *
 * Property: For any blueprint that references one or more fieldsets,
 * resolving the fieldset references should produce a complete field list
 * where each fieldset's fields appear in the correct position and with
 * their original definitions intact, regardless of how many blueprints
 * reference the same fieldset.
 */

// --- In-Memory FileSystemAdapter ---

class InMemoryFileSystemAdapter implements FileSystemAdapter {
  private files = new Map<string, string>()

  setFile(path: string, content: string): void {
    this.files.set(path, content)
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path)
    if (content === undefined) {
      throw new Error(`File not found: ${path}`)
    }
    return content
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path)
  }

  async writeFile(_path: string, _content: string): Promise<void> {
    throw new Error('Not implemented')
  }
  async deleteFile(_path: string): Promise<void> {
    throw new Error('Not implemented')
  }
  async listFiles(_directory: string, _pattern?: string): Promise<string[]> {
    throw new Error('Not implemented')
  }
  async listDirectories(_directory: string): Promise<string[]> {
    throw new Error('Not implemented')
  }
  async mkdir(_path: string): Promise<void> {
    throw new Error('Not implemented')
  }
  async copyFile(_src: string, _dest: string): Promise<void> {
    throw new Error('Not implemented')
  }
  async moveFile(_src: string, _dest: string): Promise<void> {
    throw new Error('Not implemented')
  }
}

// --- Generators ---

const FIELD_TYPES: FieldType[] = [
  'text', 'slug', 'markdown', 'tiptap', 'number', 'toggle',
  'select', 'multiselect', 'date', 'asset', 'entries',
  'taxonomy', 'replicator', 'grid', 'yaml', 'code', 'hidden',
]

/** Generate a valid field handle (lowercase alphanumeric with underscores). */
const fieldHandleArb = fc
  .stringMatching(/^[a-z][a-z0-9_]{1,15}$/)
  .filter((s) => s.length >= 2)

/** Generate a valid fieldset handle (used as filename). */
const fieldsetHandleArb = fc
  .stringMatching(/^[a-z][a-z0-9_]{2,12}$/)
  .filter((s) => s.length >= 3)

/** Generate a field type. */
const fieldTypeArb = fc.constantFrom(...FIELD_TYPES)

/** Generate a display name. */
const displayArb = fc.stringMatching(/^[A-Z][a-zA-Z ]{1,20}$/).filter((s) => s.length >= 2)

/** Generate a single FieldDefinition. */
const fieldDefinitionArb: fc.Arbitrary<FieldDefinition> = fc.record({
  handle: fieldHandleArb,
  field: fc.record({
    type: fieldTypeArb,
    display: fc.option(displayArb, { nil: undefined }),
    required: fc.option(fc.boolean(), { nil: undefined }),
  }),
}) as fc.Arbitrary<FieldDefinition>

/** Generate a list of unique field definitions (unique by handle). */
const uniqueFieldsArb = (minLength: number, maxLength: number) =>
  fc
    .array(fieldDefinitionArb, { minLength, maxLength: maxLength * 2 })
    .map((fields) => {
      const seen = new Set<string>()
      return fields.filter((f) => {
        if (seen.has(f.handle)) return false
        seen.add(f.handle)
        return true
      })
    })
    .filter((fields) => fields.length >= minLength)
    .map((fields) => fields.slice(0, maxLength))

/** Generate a fieldset definition (handle + fields). */
const fieldsetDefArb = fc.record({
  handle: fieldsetHandleArb,
  fields: uniqueFieldsArb(1, 5),
})

/** Generate multiple fieldsets with unique handles. */
const uniqueFieldsetsArb = fc
  .array(fieldsetDefArb, { minLength: 1, maxLength: 4 })
  .map((fieldsets) => {
    const seen = new Set<string>()
    return fieldsets.filter((fs) => {
      if (seen.has(fs.handle)) return false
      seen.add(fs.handle)
      return true
    })
  })
  .filter((fieldsets) => fieldsets.length >= 1)

// --- Helpers ---

const parser = new MarkdownYamlParser()

function serializeFieldsetYaml(fields: FieldDefinition[]): string {
  const yamlObj = {
    fields: fields.map((f) => ({
      handle: f.handle,
      field: {
        type: f.field.type,
        ...(f.field.display !== undefined ? { display: f.field.display } : {}),
        ...(f.field.required !== undefined ? { required: f.field.required } : {}),
      },
    })),
  }
  return parser.serializeYaml(yamlObj)
}

function setupResolver(
  fieldsets: { handle: string; fields: FieldDefinition[] }[]
): { resolver: FieldsetResolver; fsAdapter: InMemoryFileSystemAdapter } {
  const fsAdapter = new InMemoryFileSystemAdapter()
  const resourcesPath = '/resources'

  for (const fieldset of fieldsets) {
    const filePath = `/resources/fieldsets/${fieldset.handle}.yaml`
    fsAdapter.setFile(filePath, serializeFieldsetYaml(fieldset.fields))
  }

  const resolver = new FieldsetResolver(fsAdapter, parser, resourcesPath)
  return { resolver, fsAdapter }
}

// --- Property Tests ---

describe('Property 2: Fieldset Composition Correctness', () => {
  it('total field count equals direct fields + all imported fieldset fields', async () => {
    await fc.assert(
      fc.asyncProperty(uniqueFieldsetsArb, async (fieldsets) => {
        const meta = buildBlueprintWithImports(fieldsets, 2)
        const { resolver } = setupResolver(fieldsets)

        const resolved = await resolver.resolveBlueprint(meta.blueprint)

        const expectedCount =
          meta.directFields.length +
          meta.imports.reduce((sum, imp) => {
            const fs = fieldsets.find((f) => f.handle === imp.fieldsetHandle)
            return sum + (fs?.fields.length ?? 0)
          }, 0)

        expect(resolved.tabs.main.fields.length).toBe(expectedCount)
      }),
      { numRuns: 100 },
    )
  })

  it('imported fieldset fields appear at the correct position', async () => {
    await fc.assert(
      fc.asyncProperty(uniqueFieldsetsArb, async (fieldsets) => {
        const meta = buildBlueprintWithImports(fieldsets, 2)
        const { resolver } = setupResolver(fieldsets)

        const resolved = await resolver.resolveBlueprint(meta.blueprint)
        const resolvedFields = resolved.tabs.main.fields

        // Walk through the original structure and verify positions
        let resolvedIdx = 0
        for (const entry of meta.orderedEntries) {
          if (entry.type === 'direct') {
            expect(resolvedFields[resolvedIdx].handle).toBe(entry.field.handle)
            expect(resolvedFields[resolvedIdx].field.type).toBe(entry.field.field.type)
            resolvedIdx++
          } else {
            const fieldset = fieldsets.find((fs) => fs.handle === entry.fieldsetHandle)!
            for (const fsField of fieldset.fields) {
              expect(resolvedFields[resolvedIdx].handle).toBe(fsField.handle)
              expect(resolvedFields[resolvedIdx].field.type).toBe(fsField.field.type)
              resolvedIdx++
            }
          }
        }

        expect(resolvedIdx).toBe(resolvedFields.length)
      }),
      { numRuns: 100 },
    )
  })

  it('field definitions from fieldsets are preserved exactly', async () => {
    await fc.assert(
      fc.asyncProperty(uniqueFieldsetsArb, async (fieldsets) => {
        const meta = buildBlueprintWithImports(fieldsets, 1)
        const { resolver } = setupResolver(fieldsets)

        const resolved = await resolver.resolveBlueprint(meta.blueprint)
        const resolvedFields = resolved.tabs.main.fields

        // Walk through ordered entries and verify fieldset fields by position
        let resolvedIdx = 0
        for (const entry of meta.orderedEntries) {
          if (entry.type === 'direct') {
            resolvedIdx++
          } else {
            const fieldset = fieldsets.find((fs) => fs.handle === entry.fieldsetHandle)!
            for (const expectedField of fieldset.fields) {
              const actual = resolvedFields[resolvedIdx]
              expect(actual.handle).toBe(expectedField.handle)
              expect(actual.field.type).toBe(expectedField.field.type)
              if (expectedField.field.display !== undefined) {
                expect(actual.field.display).toBe(expectedField.field.display)
              }
              if (expectedField.field.required === true || expectedField.field.required === false) {
                expect(actual.field.required).toBe(expectedField.field.required)
              }
              resolvedIdx++
            }
          }
        }
      }),
      { numRuns: 100 },
    )
  })

  it('non-import fields remain unchanged after resolution', async () => {
    await fc.assert(
      fc.asyncProperty(uniqueFieldsetsArb, async (fieldsets) => {
        const meta = buildBlueprintWithImports(fieldsets, 3)
        const { resolver } = setupResolver(fieldsets)

        const resolved = await resolver.resolveBlueprint(meta.blueprint)
        const resolvedFields = resolved.tabs.main.fields

        // Walk through ordered entries and verify direct fields by position
        let resolvedIdx = 0
        for (const entry of meta.orderedEntries) {
          if (entry.type === 'direct') {
            const actual = resolvedFields[resolvedIdx]
            expect(actual.handle).toBe(entry.field.handle)
            expect(actual.field.type).toBe(entry.field.field.type)
            resolvedIdx++
          } else {
            const fieldset = fieldsets.find((fs) => fs.handle === entry.fieldsetHandle)!
            resolvedIdx += fieldset.fields.length
          }
        }
      }),
      { numRuns: 100 },
    )
  })

  it('multiple blueprints referencing the same fieldset get independent copies', async () => {
    await fc.assert(
      fc.asyncProperty(uniqueFieldsetsArb, async (fieldsets) => {
        const { resolver } = setupResolver(fieldsets)

        // Create two blueprints that both reference the first fieldset
        const targetFieldset = fieldsets[0]
        const blueprint1: Blueprint = {
          handle: 'blueprint_one',
          tabs: {
            main: {
              fields: [
                { handle: 'title_one', field: { type: 'text' } },
                { import: targetFieldset.handle } as unknown as FieldDefinition,
              ],
            },
          },
        }

        const blueprint2: Blueprint = {
          handle: 'blueprint_two',
          tabs: {
            main: {
              fields: [
                { import: targetFieldset.handle } as unknown as FieldDefinition,
                { handle: 'title_two', field: { type: 'text' } },
              ],
            },
          },
        }

        const resolved1 = await resolver.resolveBlueprint(blueprint1)
        const resolved2 = await resolver.resolveBlueprint(blueprint2)

        // Both should have the fieldset fields
        const fsFieldCount = targetFieldset.fields.length

        expect(resolved1.tabs.main.fields.length).toBe(1 + fsFieldCount)
        expect(resolved2.tabs.main.fields.length).toBe(fsFieldCount + 1)

        // Verify they are independent (modifying one doesn't affect the other)
        const fields1 = resolved1.tabs.main.fields
        const fields2 = resolved2.tabs.main.fields

        // The fieldset fields in each resolved blueprint should be equal but not the same reference
        const fsFields1 = fields1.slice(1) // after 'title_one'
        const fsFields2 = fields2.slice(0, fsFieldCount) // before 'title_two'

        for (let i = 0; i < fsFieldCount; i++) {
          expect(fsFields1[i].handle).toBe(fsFields2[i].handle)
          expect(fsFields1[i].field.type).toBe(fsFields2[i].field.type)
          // They should be separate objects (independent copies)
          expect(fsFields1[i]).not.toBe(fsFields2[i])
        }
      }),
      { numRuns: 100 },
    )
  })
})

// --- Deterministic Blueprint Builder ---

interface BlueprintMeta {
  blueprint: Blueprint
  directFields: FieldDefinition[]
  imports: { position: number; fieldsetHandle: string }[]
  orderedEntries: ({ type: 'direct'; field: FieldDefinition } | { type: 'import'; fieldsetHandle: string })[]
}

/**
 * Build a blueprint that imports all available fieldsets, interspersed with direct fields.
 * Uses a deterministic pattern: direct field, import, direct field, import, ...
 */
function buildBlueprintWithImports(
  fieldsets: { handle: string; fields: FieldDefinition[] }[],
  directFieldCount: number
): BlueprintMeta {
  const directFields: FieldDefinition[] = []
  for (let i = 0; i < directFieldCount; i++) {
    directFields.push({
      handle: `direct_field_${i}`,
      field: { type: FIELD_TYPES[i % FIELD_TYPES.length] },
    })
  }

  // Interleave: direct, import, direct, import, ...
  const fields: (FieldDefinition | { import: string })[] = []
  const orderedEntries: BlueprintMeta['orderedEntries'] = []
  const imports: { position: number; fieldsetHandle: string }[] = []

  let directIdx = 0
  let fieldsetIdx = 0
  let position = 0

  while (directIdx < directFields.length || fieldsetIdx < fieldsets.length) {
    if (directIdx < directFields.length) {
      fields.push(directFields[directIdx])
      orderedEntries.push({ type: 'direct', field: directFields[directIdx] })
      directIdx++
      position++
    }
    if (fieldsetIdx < fieldsets.length) {
      fields.push({ import: fieldsets[fieldsetIdx].handle })
      orderedEntries.push({ type: 'import', fieldsetHandle: fieldsets[fieldsetIdx].handle })
      imports.push({ position, fieldsetHandle: fieldsets[fieldsetIdx].handle })
      fieldsetIdx++
      position++
    }
  }

  const blueprint: Blueprint = {
    handle: 'test_blueprint',
    tabs: {
      main: {
        display: 'Main',
        fields: fields as unknown as FieldDefinition[],
      },
    },
  }

  return { blueprint, directFields, imports, orderedEntries }
}
