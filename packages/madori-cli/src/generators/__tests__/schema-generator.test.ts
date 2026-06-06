import { describe, it, expect } from 'vitest'
import { SchemaGenerator } from '../schema-generator.js'
import type { Blueprint, FieldConfig } from '@madori/lib/blueprints/types.js'

describe('SchemaGenerator', () => {
  let generator: SchemaGenerator

  beforeEach(() => {
    generator = new SchemaGenerator()
  })

  describe('mapFieldToZod', () => {
    it('maps text to z.string()', () => {
      expect(generator.mapFieldToZod({ type: 'text' })).toBe('z.string()')
    })

    it('maps slug to z.string()', () => {
      expect(generator.mapFieldToZod({ type: 'slug' })).toBe('z.string()')
    })

    it('maps markdown to z.string()', () => {
      expect(generator.mapFieldToZod({ type: 'markdown' })).toBe('z.string()')
    })

    it('maps tiptap to z.string()', () => {
      expect(generator.mapFieldToZod({ type: 'tiptap' })).toBe('z.string()')
    })

    it('maps code to z.string()', () => {
      expect(generator.mapFieldToZod({ type: 'code' })).toBe('z.string()')
    })

    it('maps hidden to z.string()', () => {
      expect(generator.mapFieldToZod({ type: 'hidden' })).toBe('z.string()')
    })

    it('maps date to z.string()', () => {
      expect(generator.mapFieldToZod({ type: 'date' })).toBe('z.string()')
    })

    it('maps number to z.number()', () => {
      expect(generator.mapFieldToZod({ type: 'number' })).toBe('z.number()')
    })

    it('maps toggle to z.boolean()', () => {
      expect(generator.mapFieldToZod({ type: 'toggle' })).toBe('z.boolean()')
    })

    it('maps select with options to z.enum()', () => {
      const field: FieldConfig = {
        type: 'select',
        options: { draft: 'Draft', published: 'Published' },
      }
      expect(generator.mapFieldToZod(field)).toBe("z.enum(['draft', 'published'])")
    })

    it('maps select without options to z.string()', () => {
      expect(generator.mapFieldToZod({ type: 'select' })).toBe('z.string()')
    })

    it('maps multiselect with options to z.array(z.enum())', () => {
      const field: FieldConfig = {
        type: 'multiselect',
        options: { red: 'Red', blue: 'Blue' },
      }
      expect(generator.mapFieldToZod(field)).toBe("z.array(z.enum(['red', 'blue']))")
    })

    it('maps multiselect without options to z.array(z.string())', () => {
      expect(generator.mapFieldToZod({ type: 'multiselect' })).toBe('z.array(z.string())')
    })

    it('maps asset to z.object with correct shape', () => {
      const result = generator.mapFieldToZod({ type: 'asset' })
      expect(result).toContain('z.object(')
      expect(result).toContain('path: z.string()')
      expect(result).toContain('filename: z.string()')
      expect(result).toContain('extension: z.string()')
      expect(result).toContain('size: z.number()')
      expect(result).toContain('mimeType: z.string()')
      expect(result).toContain('modifiedAt: z.string()')
      expect(result).toContain('alt: z.string().optional()')
    })

    it('maps entries to z.array(z.object(...))', () => {
      const result = generator.mapFieldToZod({ type: 'entries' })
      expect(result).toBe('z.array(z.object({ collection: z.string(), slug: z.string() }))')
    })

    it('maps taxonomy to z.array(z.string())', () => {
      expect(generator.mapFieldToZod({ type: 'taxonomy' })).toBe('z.array(z.string())')
    })

    it('maps yaml to z.record(z.string(), z.unknown())', () => {
      expect(generator.mapFieldToZod({ type: 'yaml' })).toBe('z.record(z.string(), z.unknown())')
    })

    it('maps unknown field type to z.unknown()', () => {
      expect(generator.mapFieldToZod({ type: 'nonexistent' as any })).toBe('z.unknown()')
    })

    it('maps replicator with sets to z.discriminatedUnion', () => {
      const field: FieldConfig = {
        type: 'replicator',
        options: {
          sets: {
            hero: {
              display: 'Hero',
              fields: [
                { handle: 'heading', field: { type: 'text' } },
                { handle: 'image', field: { type: 'asset' } },
              ],
            },
            cta: {
              display: 'CTA',
              fields: [
                { handle: 'text', field: { type: 'text' } },
                { handle: 'url', field: { type: 'text', required: true } },
              ],
            },
          },
        },
      }
      const result = generator.mapFieldToZod(field)
      expect(result).toContain("z.discriminatedUnion('type',")
      expect(result).toContain("type: z.literal('hero')")
      expect(result).toContain("type: z.literal('cta')")
      expect(result).toContain('heading: z.string().optional()')
      expect(result).toContain('url: z.string()')
      expect(result).not.toContain('url: z.string().optional()')
    })

    it('maps replicator without options to z.record', () => {
      expect(generator.mapFieldToZod({ type: 'replicator' })).toBe('z.record(z.string(), z.unknown())')
    })

    it('maps grid with columns to z.array(z.object(...))', () => {
      const field: FieldConfig = {
        type: 'grid',
        options: {
          columns: [
            { handle: 'name', field: { type: 'text' } },
            { handle: 'price', field: { type: 'number', required: true } },
          ],
        },
      }
      const result = generator.mapFieldToZod(field)
      expect(result).toContain('z.array(z.object(')
      expect(result).toContain('name: z.string().optional()')
      expect(result).toContain('price: z.number()')
      expect(result).not.toContain('price: z.number().optional()')
    })

    it('maps grid without options to z.array(z.record(...))', () => {
      expect(generator.mapFieldToZod({ type: 'grid' })).toBe('z.array(z.record(z.string(), z.unknown()))')
    })
  })

  describe('generate', () => {
    it('produces one schema file per blueprint plus a barrel', () => {
      const blueprints: Blueprint[] = [
        { handle: 'blog', tabs: { main: { fields: [{ handle: 'title', field: { type: 'text', required: true } }] } } },
        { handle: 'pages', tabs: { main: { fields: [{ handle: 'body', field: { type: 'tiptap' } }] } } },
      ]
      const result = generator.generate(blueprints)
      // 2 schema files + 1 barrel
      expect(result).toHaveLength(3)
      expect(result[0].filename).toBe('schemas/blog.ts')
      expect(result[1].filename).toBe('schemas/pages.ts')
      expect(result[2].filename).toBe('schemas/index.ts')
    })

    it('generates correct schema name using PascalCase + EntrySchema', () => {
      const blueprints: Blueprint[] = [
        { handle: 'getting-started', tabs: { main: { fields: [{ handle: 'title', field: { type: 'text' } }] } } },
      ]
      const result = generator.generate(blueprints)
      expect(result[0].content).toContain('export const GettingStartedEntrySchema')
    })

    it('imports from zod/v4', () => {
      const blueprints: Blueprint[] = [
        { handle: 'blog', tabs: { main: { fields: [{ handle: 'title', field: { type: 'text' } }] } } },
      ]
      const result = generator.generate(blueprints)
      expect(result[0].content).toContain("import { z } from 'zod/v4'")
    })

    it('exports parse and safeParse functions', () => {
      const blueprints: Blueprint[] = [
        { handle: 'blog', tabs: { main: { fields: [{ handle: 'title', field: { type: 'text' } }] } } },
      ]
      const result = generator.generate(blueprints)
      expect(result[0].content).toContain('export const parse = (data: unknown) => BlogEntrySchema.parse(data)')
      expect(result[0].content).toContain('export const safeParse = (data: unknown) => BlogEntrySchema.safeParse(data)')
    })

    it('exports inferred type', () => {
      const blueprints: Blueprint[] = [
        { handle: 'blog', tabs: { main: { fields: [{ handle: 'title', field: { type: 'text' } }] } } },
      ]
      const result = generator.generate(blueprints)
      expect(result[0].content).toContain('export type BlogEntry = z.infer<typeof BlogEntrySchema>')
    })

    it('marks required fields without .optional() and optional fields with .optional()', () => {
      const blueprints: Blueprint[] = [
        {
          handle: 'blog',
          tabs: {
            main: {
              fields: [
                { handle: 'title', field: { type: 'text', required: true } },
                { handle: 'subtitle', field: { type: 'text' } },
                { handle: 'draft', field: { type: 'toggle', required: false } },
              ],
            },
          },
        },
      ]
      const result = generator.generate(blueprints)
      expect(result[0].content).toContain('title: z.string(),')
      expect(result[0].content).toContain('subtitle: z.string().optional(),')
      expect(result[0].content).toContain('draft: z.boolean().optional(),')
    })

    it('flattens fields from multiple tabs and sections', () => {
      const blueprints: Blueprint[] = [
        {
          handle: 'blog',
          tabs: {
            main: {
              fields: [{ handle: 'title', field: { type: 'text', required: true } }],
            },
            sidebar: {
              fields: [{ handle: 'author', field: { type: 'text' } }],
              sections: {
                meta: {
                  fields: [{ handle: 'publishedAt', field: { type: 'date' } }],
                },
              },
            },
          },
        },
      ]
      const result = generator.generate(blueprints)
      expect(result[0].content).toContain('title: z.string(),')
      expect(result[0].content).toContain('author: z.string().optional(),')
      expect(result[0].content).toContain('publishedAt: z.string().optional(),')
    })

    it('applies validation rules from validate array', () => {
      const blueprints: Blueprint[] = [
        {
          handle: 'blog',
          tabs: {
            main: {
              fields: [
                { handle: 'email', field: { type: 'text', required: true, validate: ['required', 'email'] } },
                { handle: 'url', field: { type: 'text', validate: ['url'] } },
                { handle: 'title', field: { type: 'text', required: true, validate: ['min:3', 'max:100'] } },
                { handle: 'count', field: { type: 'number', required: true, validate: ['min:1', 'max:50'] } },
              ],
            },
          },
        },
      ]
      const result = generator.generate(blueprints)
      expect(result[0].content).toContain('email: z.string().email(),')
      expect(result[0].content).toContain('url: z.string().url().optional(),')
      expect(result[0].content).toContain('title: z.string().min(3).max(100),')
      expect(result[0].content).toContain('count: z.number().min(1).max(50),')
    })

    it('silently skips unknown validation rules', () => {
      const blueprints: Blueprint[] = [
        {
          handle: 'blog',
          tabs: {
            main: {
              fields: [
                { handle: 'title', field: { type: 'text', required: true, validate: ['alpha_dash', 'min:3'] } },
              ],
            },
          },
        },
      ]
      const result = generator.generate(blueprints)
      expect(result[0].content).toContain('title: z.string().min(3),')
      expect(result[0].content).not.toContain('alpha_dash')
    })
  })

  describe('barrel file', () => {
    it('generates schemas/index.ts with re-exports using .js extension', () => {
      const blueprints: Blueprint[] = [
        { handle: 'blog', tabs: { main: { fields: [{ handle: 'title', field: { type: 'text' } }] } } },
        { handle: 'pages', tabs: { main: { fields: [{ handle: 'body', field: { type: 'tiptap' } }] } } },
      ]
      const result = generator.generate(blueprints)
      const barrel = result.find((f) => f.filename === 'schemas/index.ts')
      expect(barrel).toBeDefined()
      expect(barrel!.content).toContain("export * from './blog.js'")
      expect(barrel!.content).toContain("export * from './pages.js'")
    })

    it('barrel ends with a newline', () => {
      const blueprints: Blueprint[] = [
        { handle: 'blog', tabs: { main: { fields: [{ handle: 'title', field: { type: 'text' } }] } } },
      ]
      const result = generator.generate(blueprints)
      const barrel = result.find((f) => f.filename === 'schemas/index.ts')
      expect(barrel!.content).toMatch(/\n$/)
    })
  })
})
