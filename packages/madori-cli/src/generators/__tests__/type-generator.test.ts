import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TypeGenerator, toPascalCaseEntry } from '../type-generator.js'
import type { Blueprint, FieldConfig } from '@madori/lib/blueprints/types.js'

describe('TypeGenerator', () => {
  let generator: TypeGenerator

  beforeEach(() => {
    generator = new TypeGenerator()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('toPascalCaseEntry', () => {
    it('converts simple handle to PascalCaseEntry', () => {
      expect(toPascalCaseEntry('blog')).toBe('BlogEntry')
    })

    it('converts kebab-case handle', () => {
      expect(toPascalCaseEntry('getting-started')).toBe('GettingStartedEntry')
    })

    it('converts underscore-separated handle', () => {
      expect(toPascalCaseEntry('site_settings')).toBe('SiteSettingsEntry')
    })
  })

  describe('mapFieldToType', () => {
    it('maps text to string', () => {
      expect(generator.mapFieldToType({ type: 'text' })).toBe('string')
    })

    it('maps slug to string', () => {
      expect(generator.mapFieldToType({ type: 'slug' })).toBe('string')
    })

    it('maps markdown to string', () => {
      expect(generator.mapFieldToType({ type: 'markdown' })).toBe('string')
    })

    it('maps tiptap to string', () => {
      expect(generator.mapFieldToType({ type: 'tiptap' })).toBe('string')
    })

    it('maps code to string', () => {
      expect(generator.mapFieldToType({ type: 'code' })).toBe('string')
    })

    it('maps hidden to string', () => {
      expect(generator.mapFieldToType({ type: 'hidden' })).toBe('string')
    })

    it('maps date to string', () => {
      expect(generator.mapFieldToType({ type: 'date' })).toBe('string')
    })

    it('maps number to number', () => {
      expect(generator.mapFieldToType({ type: 'number' })).toBe('number')
    })

    it('maps toggle to boolean', () => {
      expect(generator.mapFieldToType({ type: 'toggle' })).toBe('boolean')
    })

    it('maps select to union of string literals', () => {
      const field: FieldConfig = {
        type: 'select',
        options: { draft: 'Draft', published: 'Published', archived: 'Archived' },
      }
      expect(generator.mapFieldToType(field)).toBe("'draft' | 'published' | 'archived'")
    })

    it('maps select with no options to string', () => {
      expect(generator.mapFieldToType({ type: 'select' })).toBe('string')
    })

    it('maps multiselect to Array of union', () => {
      const field: FieldConfig = {
        type: 'multiselect',
        options: { red: 'Red', blue: 'Blue' },
      }
      expect(generator.mapFieldToType(field)).toBe("Array<'red' | 'blue'>")
    })

    it('maps multiselect with no options to string[]', () => {
      expect(generator.mapFieldToType({ type: 'multiselect' })).toBe('string[]')
    })

    it('maps asset to MadoriAsset', () => {
      expect(generator.mapFieldToType({ type: 'asset' })).toBe('MadoriAsset')
    })

    it('maps entries to MadoriEntryRef[]', () => {
      expect(generator.mapFieldToType({ type: 'entries' })).toBe('MadoriEntryRef[]')
    })

    it('maps taxonomy to string[]', () => {
      expect(generator.mapFieldToType({ type: 'taxonomy' })).toBe('string[]')
    })

    it('maps yaml to Record<string, unknown>', () => {
      expect(generator.mapFieldToType({ type: 'yaml' })).toBe('Record<string, unknown>')
    })

    it('maps replicator to discriminated union', () => {
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
                { handle: 'url', field: { type: 'text' } },
              ],
            },
          },
        },
      }
      const result = generator.mapFieldToType(field)
      expect(result).toContain("type: 'hero'")
      expect(result).toContain("type: 'cta'")
      expect(result).toContain('heading?: string')
      expect(result).toContain('image?: MadoriAsset')
      expect(result).toContain('text?: string')
      expect(result).toContain('url?: string')
    })

    it('maps grid to Array of row objects', () => {
      const field: FieldConfig = {
        type: 'grid',
        options: {
          columns: [
            { handle: 'name', field: { type: 'text' } },
            { handle: 'price', field: { type: 'number', required: true } },
          ],
        },
      }
      const result = generator.mapFieldToType(field)
      expect(result).toBe('Array<{ name?: string; price: number }>')
    })

    it('maps unknown field type to unknown and warns', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = generator.mapFieldToType({ type: 'nonexistent' as any })
      expect(result).toBe('unknown')
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown field type'))
    })
  })

  describe('generate', () => {
    it('produces one file per blueprint', () => {
      const blueprints: Blueprint[] = [
        { handle: 'blog', tabs: { main: { fields: [{ handle: 'title', field: { type: 'text', required: true } }] } } },
        { handle: 'pages', tabs: { main: { fields: [{ handle: 'body', field: { type: 'tiptap' } }] } } },
      ]
      const result = generator.generate(blueprints)
      expect(result).toHaveLength(2)
      expect(result[0].filename).toBe('types/blog.ts')
      expect(result[1].filename).toBe('types/pages.ts')
    })

    it('generated interface extends MadoriEntryMeta', () => {
      const blueprints: Blueprint[] = [
        { handle: 'blog', tabs: { main: { fields: [{ handle: 'title', field: { type: 'text', required: true } }] } } },
      ]
      const result = generator.generate(blueprints)
      expect(result[0].content).toContain('extends MadoriEntryMeta')
    })

    it('imports MadoriAsset when asset field is present', () => {
      const blueprints: Blueprint[] = [
        { handle: 'blog', tabs: { main: { fields: [{ handle: 'image', field: { type: 'asset' } }] } } },
      ]
      const result = generator.generate(blueprints)
      expect(result[0].content).toContain('MadoriAsset')
    })

    it('imports MadoriEntryRef when entries field is present', () => {
      const blueprints: Blueprint[] = [
        { handle: 'blog', tabs: { main: { fields: [{ handle: 'related', field: { type: 'entries' } }] } } },
      ]
      const result = generator.generate(blueprints)
      expect(result[0].content).toContain('MadoriEntryRef')
    })

    it('marks required fields without ? and optional fields with ?', () => {
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
      expect(result[0].content).toContain('title: string')
      expect(result[0].content).toContain('subtitle?: string')
      expect(result[0].content).toContain('draft?: boolean')
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
      expect(result[0].content).toContain('title: string')
      expect(result[0].content).toContain('author?: string')
      expect(result[0].content).toContain('publishedAt?: string')
    })

    it('includes JSDoc with @description from display', () => {
      const blueprints: Blueprint[] = [
        {
          handle: 'blog',
          tabs: {
            main: {
              fields: [{ handle: 'title', field: { type: 'text', display: 'Title', required: true } }],
            },
          },
        },
      ]
      const result = generator.generate(blueprints)
      expect(result[0].content).toContain('@description Title')
    })

    it('includes instructions in JSDoc', () => {
      const blueprints: Blueprint[] = [
        {
          handle: 'blog',
          tabs: {
            main: {
              fields: [{ handle: 'slug', field: { type: 'slug', instructions: 'URL-friendly identifier' } }],
            },
          },
        },
      ]
      const result = generator.generate(blueprints)
      expect(result[0].content).toContain('URL-friendly identifier')
    })

    it('includes @see referencing source blueprint path', () => {
      const blueprints: Blueprint[] = [
        { handle: 'blog', tabs: { main: { fields: [] } } },
      ]
      const result = generator.generate(blueprints)
      expect(result[0].content).toContain('@see resources/blueprints/collections/blog.yaml')
    })

    it('includes @enum annotation for select fields', () => {
      const blueprints: Blueprint[] = [
        {
          handle: 'blog',
          tabs: {
            main: {
              fields: [{
                handle: 'status',
                field: {
                  type: 'select',
                  display: 'Status',
                  options: { draft: 'Draft', published: 'Published' },
                },
              }],
            },
          },
        },
      ]
      const result = generator.generate(blueprints)
      expect(result[0].content).toContain('@enum {draft, published}')
    })
  })

  describe('generateBarrel', () => {
    it('generates top-level barrel re-exporting from types, schemas, graphql, and client', () => {
      const files = [
        { filename: 'types/blog.ts', content: '', blueprintHandle: 'blog' },
        { filename: 'types/pages.ts', content: '', blueprintHandle: 'pages' },
      ]
      const barrel = generator.generateBarrel(files)
      expect(barrel).toContain("export * from './types/index.js'")
      expect(barrel).toContain("export * from './schemas/index.js'")
      expect(barrel).toContain("export * from './graphql/index.js'")
      expect(barrel).toContain("export * from './client.js'")
    })

    it('top-level barrel does not contain direct type file re-exports', () => {
      const files = [
        { filename: 'types/blog.ts', content: '', blueprintHandle: 'blog' },
      ]
      const barrel = generator.generateBarrel(files)
      expect(barrel).not.toContain("'./types/blog.js'")
    })
  })

  describe('generateTypesBarrel', () => {
    it('generates re-exports for all individual type files', () => {
      const files = [
        { filename: 'types/blog.ts', content: '', blueprintHandle: 'blog' },
        { filename: 'types/pages.ts', content: '', blueprintHandle: 'pages' },
      ]
      const barrel = generator.generateTypesBarrel(files)
      expect(barrel).toContain("export * from './blog.js'")
      expect(barrel).toContain("export * from './pages.js'")
    })

    it('uses relative paths without types/ prefix', () => {
      const files = [
        { filename: 'types/getting-started.ts', content: '', blueprintHandle: 'getting-started' },
      ]
      const barrel = generator.generateTypesBarrel(files)
      expect(barrel).toContain("export * from './getting-started.js'")
      expect(barrel).not.toContain('types/')
    })

    it('ends with a newline', () => {
      const files = [
        { filename: 'types/blog.ts', content: '', blueprintHandle: 'blog' },
      ]
      const barrel = generator.generateTypesBarrel(files)
      expect(barrel).toMatch(/\n$/)
    })
  })
})
