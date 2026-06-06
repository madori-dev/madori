import { describe, it, expect } from 'vitest'
import { BlueprintValidator } from '@/lib/blueprints/validator'
import { BlueprintLoader } from '@/lib/blueprints/loader'
import { MarkdownYamlParser } from '@/lib/fs/parser'

/**
 * Unit tests for BlueprintValidator edge cases.
 * Validates: Requirements 6.1
 */

describe('BlueprintValidator — edge cases', () => {
  const validator = new BlueprintValidator()

  describe('empty tabs', () => {
    it('passes validation with empty tabs object', () => {
      const result = validator.validate({ tabs: {} })
      expect(result.success).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('passes validation with a tab containing empty fields array', () => {
      const result = validator.validate({
        tabs: {
          main: { fields: [] },
        },
      })
      expect(result.success).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('deeply nested sections', () => {
    it('passes validation for sections containing fields', () => {
      const result = validator.validate({
        tabs: {
          content: {
            fields: [],
            sections: {
              meta: {
                display: 'Metadata',
                fields: [
                  { handle: 'title', field: { type: 'text' } },
                  { handle: 'slug', field: { type: 'slug' } },
                ],
              },
              seo: {
                display: 'SEO',
                fields: [
                  { handle: 'meta_title', field: { type: 'text' } },
                  { handle: 'meta_description', field: { type: 'text' } },
                ],
              },
            },
          },
        },
      })
      expect(result.success).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('passes validation for sections with all optional field config', () => {
      const result = validator.validate({
        tabs: {
          main: {
            fields: [],
            sections: {
              advanced: {
                display: 'Advanced',
                fields: [
                  {
                    handle: 'rich_content',
                    field: {
                      type: 'tiptap',
                      display: 'Rich Content',
                      instructions: 'Enter your content here',
                      required: true,
                      validate: ['required'],
                      options: { toolbar: 'full' },
                    },
                  },
                ],
              },
            },
          },
        },
      })
      expect(result.success).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('missing required properties', () => {
    it('fails when tabs property is missing entirely', () => {
      const result = validator.validate({})
      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.some((e) => e.code === 'MISSING_PROPERTY')).toBe(true)
    })

    it('succeeds when fields array is missing from a tab (defaults to empty)', () => {
      const result = validator.validate({
        tabs: {
          main: { display: 'Main' },
        },
      })
      expect(result.success).toBe(true)
    })

    it('fails when field handle is empty string', () => {
      const result = validator.validate({
        tabs: {
          main: {
            fields: [{ handle: '', field: { type: 'text' } }],
          },
        },
      })
      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('fails when field config is missing type', () => {
      const result = validator.validate({
        tabs: {
          main: {
            fields: [{ handle: 'title', field: {} }],
          },
        },
      })
      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('fails for null input', () => {
      const result = validator.validate(null)
      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('fails for non-object input', () => {
      const result = validator.validate('not an object')
      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('unknown field type (INVALID_TYPE)', () => {
    it('rejects a field with an unknown type', () => {
      const result = validator.validate({
        tabs: {
          main: {
            fields: [{ handle: 'foo', field: { type: 'unicorn' } }],
          },
        },
      })
      expect(result.success).toBe(false)
      expect(result.errors.some((e) => e.code === 'INVALID_TYPE')).toBe(true)
    })

    it('rejects multiple fields with unknown types', () => {
      const result = validator.validate({
        tabs: {
          main: {
            fields: [
              { handle: 'a', field: { type: 'banana' } },
              { handle: 'b', field: { type: 'spaceship' } },
            ],
          },
        },
      })
      expect(result.success).toBe(false)
      const typeErrors = result.errors.filter((e) => e.code === 'INVALID_TYPE')
      expect(typeErrors.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('unknown validation rule (UNKNOWN_RULE)', () => {
    it('rejects a field with an unknown validate rule', () => {
      const result = validator.validate({
        tabs: {
          main: {
            fields: [
              { handle: 'title', field: { type: 'text', validate: ['nonexistent_rule'] } },
            ],
          },
        },
      })
      expect(result.success).toBe(false)
      expect(result.errors.some((e) => e.code === 'UNKNOWN_RULE')).toBe(true)
    })

    it('accepts known rules like required, min, max', () => {
      const result = validator.validate({
        tabs: {
          main: {
            fields: [
              { handle: 'title', field: { type: 'text', validate: ['required', 'max:255'] } },
            ],
          },
        },
      })
      expect(result.success).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('rejects a rule with unknown name even when parameterised', () => {
      const result = validator.validate({
        tabs: {
          main: {
            fields: [
              { handle: 'title', field: { type: 'text', validate: ['fancy_check:100'] } },
            ],
          },
        },
      })
      expect(result.success).toBe(false)
      expect(result.errors.some((e) => e.code === 'UNKNOWN_RULE')).toBe(true)
      expect(result.errors[0].message).toContain('fancy_check')
    })
  })

  describe('duplicate handles (DUPLICATE_HANDLE)', () => {
    it('rejects duplicate handles within the same tab', () => {
      const result = validator.validate({
        tabs: {
          main: {
            fields: [
              { handle: 'title', field: { type: 'text' } },
              { handle: 'title', field: { type: 'slug' } },
            ],
          },
        },
      })
      expect(result.success).toBe(false)
      expect(result.errors.some((e) => e.code === 'DUPLICATE_HANDLE')).toBe(true)
    })

    it('rejects duplicate handles across different tabs', () => {
      const result = validator.validate({
        tabs: {
          main: {
            fields: [{ handle: 'title', field: { type: 'text' } }],
          },
          sidebar: {
            fields: [{ handle: 'title', field: { type: 'text' } }],
          },
        },
      })
      expect(result.success).toBe(false)
      expect(result.errors.some((e) => e.code === 'DUPLICATE_HANDLE')).toBe(true)
    })

    it('rejects duplicate handles across tabs and sections', () => {
      const result = validator.validate({
        tabs: {
          main: {
            fields: [{ handle: 'slug', field: { type: 'slug' } }],
            sections: {
              meta: {
                fields: [{ handle: 'slug', field: { type: 'text' } }],
              },
            },
          },
        },
      })
      expect(result.success).toBe(false)
      expect(result.errors.some((e) => e.code === 'DUPLICATE_HANDLE')).toBe(true)
      expect(result.errors[0].message).toContain('slug')
    })
  })

  describe('dangling visibility references (warnings)', () => {
    it('warns when visibility references a non-existent handle', () => {
      const result = validator.validate({
        tabs: {
          main: {
            fields: [
              {
                handle: 'body',
                field: {
                  type: 'text',
                  visibility: { field: 'ghost_field', operator: 'equals', value: 'yes' },
                },
              },
            ],
          },
        },
      })
      expect(result.success).toBe(true) // warnings don't fail validation
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0].code).toBe('DANGLING_VISIBILITY_REF')
      expect(result.warnings[0].message).toContain('ghost_field')
    })

    it('does not warn when visibility references an existing handle', () => {
      const result = validator.validate({
        tabs: {
          main: {
            fields: [
              { handle: 'show_body', field: { type: 'toggle' } },
              {
                handle: 'body',
                field: {
                  type: 'text',
                  visibility: { field: 'show_body', operator: 'equals', value: true },
                },
              },
            ],
          },
        },
      })
      expect(result.success).toBe(true)
      expect(result.warnings).toHaveLength(0)
    })
  })

  describe('integration with BlueprintLoader', () => {
    it('loader returns null for a blueprint with invalid field type', async () => {
      const parser = new MarkdownYamlParser()
      const mockFs = {
        exists: async () => true,
        readFile: async () =>
          'tabs:\n  main:\n    fields:\n      - handle: title\n        field:\n          type: invalid_type_xyz\n',
        listFiles: async () => [],
        writeFile: async () => {},
        deleteFile: async () => {},
      } as any

      const loader = new BlueprintLoader(mockFs, parser, '/fake/path')
      const result = await loader.loadBlueprint('collections', 'broken')
      expect(result).toBeNull()
    })

    it('loader returns null for a blueprint missing tabs', async () => {
      const parser = new MarkdownYamlParser()
      const mockFs = {
        exists: async () => true,
        readFile: async () => 'title: My Blueprint\nfields:\n  - handle: test\n',
        listFiles: async () => [],
        writeFile: async () => {},
        deleteFile: async () => {},
      } as any

      const loader = new BlueprintLoader(mockFs, parser, '/fake/path')
      const result = await loader.loadBlueprint('collections', 'no-tabs')
      expect(result).toBeNull()
    })
  })
})
