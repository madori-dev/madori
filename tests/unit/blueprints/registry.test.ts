import { describe, it, expect } from 'vitest'
import { BlueprintRegistry } from '@/lib/blueprints/registry'
import { BlueprintLoader } from '@/lib/blueprints/loader'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import type { Blueprint } from '@/lib/blueprints/types'
import * as path from 'path'

const resourcesPath = path.resolve(__dirname, '../../../resources')

describe('BlueprintRegistry', () => {
  const fs = new NodeFileSystemAdapter()
  const parser = new MarkdownYamlParser()
  const loader = new BlueprintLoader(fs, parser, resourcesPath)
  const registry = new BlueprintRegistry(loader)

  describe('getBlueprint', () => {
    it('delegates to loader and returns a blueprint', async () => {
      const blueprint = await registry.getBlueprint('collections', 'blog')
      expect(blueprint).not.toBeNull()
      expect(blueprint!.handle).toBe('blog')
    })

    it('returns null for non-existent blueprint', async () => {
      const blueprint = await registry.getBlueprint('collections', 'nonexistent')
      expect(blueprint).toBeNull()
    })
  })

  describe('listBlueprints', () => {
    it('delegates to loader and returns blueprints', async () => {
      const blueprints = await registry.listBlueprints('collections')
      expect(blueprints.length).toBeGreaterThanOrEqual(1)
      expect(blueprints.some((b) => b.handle === 'blog')).toBe(true)
    })
  })

  describe('generateZodSchema', () => {
    it('generates a schema from a blueprint with text fields', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { handle: 'title', field: { type: 'text', required: true } },
              { handle: 'subtitle', field: { type: 'text' } },
            ],
          },
        },
      }

      const schema = registry.generateZodSchema(blueprint)
      // Required text field: min(1) enforced
      expect(schema.safeParse({ title: 'Hello' }).success).toBe(true)
      expect(schema.safeParse({ title: '' }).success).toBe(false)
      // Optional field can be omitted
      expect(schema.safeParse({ title: 'Hello' }).success).toBe(true)
    })

    it('generates schema for slug field with regex', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { handle: 'slug', field: { type: 'slug', required: true } },
            ],
          },
        },
      }

      const schema = registry.generateZodSchema(blueprint)
      expect(schema.safeParse({ slug: 'hello-world' }).success).toBe(true)
      expect(schema.safeParse({ slug: 'valid-123' }).success).toBe(true)
      expect(schema.safeParse({ slug: 'Invalid Slug' }).success).toBe(false)
      expect(schema.safeParse({ slug: 'has_underscore' }).success).toBe(false)
    })

    it('generates schema for number field', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { handle: 'count', field: { type: 'number', required: true } },
            ],
          },
        },
      }

      const schema = registry.generateZodSchema(blueprint)
      expect(schema.safeParse({ count: 42 }).success).toBe(true)
      expect(schema.safeParse({ count: 'not a number' }).success).toBe(false)
    })

    it('generates schema for toggle field', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { handle: 'active', field: { type: 'toggle', required: true } },
            ],
          },
        },
      }

      const schema = registry.generateZodSchema(blueprint)
      expect(schema.safeParse({ active: true }).success).toBe(true)
      expect(schema.safeParse({ active: false }).success).toBe(true)
      expect(schema.safeParse({ active: 'yes' }).success).toBe(false)
    })

    it('generates schema for select field with options', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              {
                handle: 'status',
                field: {
                  type: 'select',
                  required: true,
                  options: { published: 'published', draft: 'draft' } as Record<string, unknown>,
                },
              },
            ],
          },
        },
      }

      const schema = registry.generateZodSchema(blueprint)
      expect(schema.safeParse({ status: 'published' }).success).toBe(true)
      expect(schema.safeParse({ status: 'draft' }).success).toBe(true)
      expect(schema.safeParse({ status: 'archived' }).success).toBe(false)
    })

    it('generates schema for select field with array options', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              {
                handle: 'status',
                field: {
                  type: 'select',
                  required: true,
                  // Array options (as stored from YAML parsing)
                  options: ['published', 'draft'] as unknown as Record<string, unknown>,
                },
              },
            ],
          },
        },
      }

      const schema = registry.generateZodSchema(blueprint)
      expect(schema.safeParse({ status: 'published' }).success).toBe(true)
      expect(schema.safeParse({ status: 'invalid' }).success).toBe(false)
    })

    it('generates schema for multiselect field', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { handle: 'tags', field: { type: 'multiselect', required: true } },
            ],
          },
        },
      }

      const schema = registry.generateZodSchema(blueprint)
      expect(schema.safeParse({ tags: ['a', 'b'] }).success).toBe(true)
      expect(schema.safeParse({ tags: [] }).success).toBe(true)
      expect(schema.safeParse({ tags: 'not-array' }).success).toBe(false)
    })

    it('generates schema for date field', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { handle: 'published_at', field: { type: 'date', required: true } },
            ],
          },
        },
      }

      const schema = registry.generateZodSchema(blueprint)
      expect(schema.safeParse({ published_at: '2024-01-15' }).success).toBe(true)
      expect(schema.safeParse({ published_at: 123 }).success).toBe(false)
    })

    it('generates schema for asset field', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { handle: 'image', field: { type: 'asset', required: true } },
            ],
          },
        },
      }

      const schema = registry.generateZodSchema(blueprint)
      expect(schema.safeParse({ image: '/assets/photo.jpg' }).success).toBe(true)
      expect(schema.safeParse({ image: 123 }).success).toBe(false)
    })

    it('generates schema for entries field', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { handle: 'related', field: { type: 'entries', required: true } },
            ],
          },
        },
      }

      const schema = registry.generateZodSchema(blueprint)
      expect(schema.safeParse({ related: ['post-1', 'post-2'] }).success).toBe(true)
      expect(schema.safeParse({ related: 'single' }).success).toBe(false)
    })

    it('generates schema for taxonomy field', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { handle: 'categories', field: { type: 'taxonomy', required: true } },
            ],
          },
        },
      }

      const schema = registry.generateZodSchema(blueprint)
      expect(schema.safeParse({ categories: ['updates', 'news'] }).success).toBe(true)
      expect(schema.safeParse({ categories: 'single' }).success).toBe(false)
    })

    it('generates schema for replicator field', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { handle: 'blocks', field: { type: 'replicator', required: true } },
            ],
          },
        },
      }

      const schema = registry.generateZodSchema(blueprint)
      expect(schema.safeParse({ blocks: [{ type: 'hero', heading: 'Hi' }] }).success).toBe(true)
      expect(schema.safeParse({ blocks: 'not-array' }).success).toBe(false)
    })

    it('generates schema for grid field', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { handle: 'rows', field: { type: 'grid', required: true } },
            ],
          },
        },
      }

      const schema = registry.generateZodSchema(blueprint)
      expect(schema.safeParse({ rows: [{ col1: 'a', col2: 'b' }] }).success).toBe(true)
      expect(schema.safeParse({ rows: 'not-array' }).success).toBe(false)
    })

    it('generates schema for yaml field', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { handle: 'raw', field: { type: 'yaml', required: true } },
            ],
          },
        },
      }

      const schema = registry.generateZodSchema(blueprint)
      expect(schema.safeParse({ raw: 'key: value' }).success).toBe(true)
      expect(schema.safeParse({ raw: 123 }).success).toBe(false)
    })

    it('generates schema for code field', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { handle: 'snippet', field: { type: 'code', required: true } },
            ],
          },
        },
      }

      const schema = registry.generateZodSchema(blueprint)
      expect(schema.safeParse({ snippet: 'const x = 1' }).success).toBe(true)
      expect(schema.safeParse({ snippet: 123 }).success).toBe(false)
    })

    it('generates schema for hidden field (accepts any value)', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { handle: 'meta', field: { type: 'hidden' } },
            ],
          },
        },
      }

      const schema = registry.generateZodSchema(blueprint)
      expect(schema.safeParse({ meta: 'anything' }).success).toBe(true)
      expect(schema.safeParse({ meta: 123 }).success).toBe(true)
      expect(schema.safeParse({ meta: null }).success).toBe(true)
      expect(schema.safeParse({}).success).toBe(true)
    })

    it('handles optional fields (not required, no default)', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { handle: 'title', field: { type: 'text', required: true } },
              { handle: 'subtitle', field: { type: 'text' } },
            ],
          },
        },
      }

      const schema = registry.generateZodSchema(blueprint)
      // subtitle is optional, can be omitted
      expect(schema.safeParse({ title: 'Hello' }).success).toBe(true)
      // subtitle can be provided
      expect(schema.safeParse({ title: 'Hello', subtitle: 'World' }).success).toBe(true)
    })

    it('generates schema for markdown field', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { handle: 'body', field: { type: 'markdown', required: true } },
            ],
          },
        },
      }

      const schema = registry.generateZodSchema(blueprint)
      expect(schema.safeParse({ body: '# Hello\n\nWorld' }).success).toBe(true)
      expect(schema.safeParse({ body: '' }).success).toBe(true) // markdown allows empty string
      expect(schema.safeParse({ body: 123 }).success).toBe(false)
    })

    it('generates schema for tiptap field', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { handle: 'content', field: { type: 'tiptap', required: true } },
            ],
          },
        },
      }

      const schema = registry.generateZodSchema(blueprint)
      expect(schema.safeParse({ content: '<p>Hello</p>' }).success).toBe(true)
      expect(schema.safeParse({ content: 123 }).success).toBe(false)
    })

    it('generates schema for unknown field type (falls back to z.unknown)', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { handle: 'custom', field: { type: 'nonexistent' as any } },
            ],
          },
        },
      }

      const schema = registry.generateZodSchema(blueprint)
      expect(schema.safeParse({ custom: 'anything' }).success).toBe(true)
      expect(schema.safeParse({ custom: 42 }).success).toBe(true)
      expect(schema.safeParse({}).success).toBe(true) // unknown + optional
    })

    it('generates schema for select field with no options (falls back to z.string)', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { handle: 'choice', field: { type: 'select', required: true } },
            ],
          },
        },
      }

      const schema = registry.generateZodSchema(blueprint)
      // Without options, accepts any string
      expect(schema.safeParse({ choice: 'anything' }).success).toBe(true)
      expect(schema.safeParse({ choice: 123 }).success).toBe(false)
    })

    it('handles an empty blueprint with no fields', () => {
      const blueprint: Blueprint = {
        handle: 'empty',
        tabs: {
          main: {
            fields: [],
          },
        },
      }

      const schema = registry.generateZodSchema(blueprint)
      expect(schema.safeParse({}).success).toBe(true)
      expect(schema.safeParse({ extra: 'data' }).success).toBe(true) // passthrough by default in z.object
    })

    it('handles fields with default values', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { handle: 'status', field: { type: 'text', default: 'draft' } },
            ],
          },
        },
      }

      const schema = registry.generateZodSchema(blueprint)
      // Default value fills in when undefined
      const result = schema.safeParse({})
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ status: 'draft' })
    })

    it('collects fields from multiple tabs', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { handle: 'title', field: { type: 'text', required: true } },
            ],
          },
          sidebar: {
            fields: [
              { handle: 'status', field: { type: 'select', required: true, options: ['published', 'draft'] as unknown as Record<string, unknown> } },
            ],
          },
        },
      }

      const schema = registry.generateZodSchema(blueprint)
      expect(schema.safeParse({ title: 'Hello', status: 'published' }).success).toBe(true)
      expect(schema.safeParse({ title: 'Hello' }).success).toBe(false)
    })

    it('collects fields from sections within tabs', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { handle: 'title', field: { type: 'text', required: true } },
            ],
            sections: {
              meta: {
                fields: [
                  { handle: 'author', field: { type: 'text', required: true } },
                ],
              },
            },
          },
        },
      }

      const schema = registry.generateZodSchema(blueprint)
      expect(schema.safeParse({ title: 'Hello', author: 'Michael' }).success).toBe(true)
      expect(schema.safeParse({ title: 'Hello' }).success).toBe(false)
    })
  })

  describe('validateData', () => {
    it('returns success for valid data', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { handle: 'title', field: { type: 'text', required: true } },
            ],
          },
        },
      }

      const result = registry.validateData(blueprint, { title: 'Hello' })
      expect(result.success).toBe(true)
      expect(result.errors).toBeUndefined()
    })

    it('returns structured errors for invalid data', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { handle: 'title', field: { type: 'text', required: true } },
              { handle: 'count', field: { type: 'number', required: true } },
            ],
          },
        },
      }

      const result = registry.validateData(blueprint, { title: '', count: 'not-a-number' })
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors!['title']).toBeDefined()
      expect(result.errors!['title'].length).toBeGreaterThan(0)
      expect(result.errors!['count']).toBeDefined()
      expect(result.errors!['count'].length).toBeGreaterThan(0)
    })

    it('returns errors for missing required fields', () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { handle: 'title', field: { type: 'text', required: true } },
              { handle: 'slug', field: { type: 'slug', required: true } },
            ],
          },
        },
      }

      const result = registry.validateData(blueprint, {})
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors!['title']).toBeDefined()
      expect(result.errors!['slug']).toBeDefined()
    })

    it('validates the real blog blueprint', async () => {
      const blueprint = await registry.getBlueprint('collections', 'blog')
      expect(blueprint).not.toBeNull()

      const validResult = registry.validateData(blueprint!, {
        title: 'Hello World',
        slug: 'hello-world',
        content: '# Hello',
      })
      expect(validResult.success).toBe(true)

      const invalidResult = registry.validateData(blueprint!, {
        title: '', // required, min(1) fails
        slug: 'Invalid Slug!',
        content: '# Hello',
      })
      expect(invalidResult.success).toBe(false)
    })
  })
})
