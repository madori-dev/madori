import { describe, it, expect } from 'vitest'
import { FieldsetResolver } from '@/lib/blueprints/fieldsets'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import type { Blueprint } from '@/lib/blueprints/types'
import * as path from 'path'

const resourcesPath = path.resolve(__dirname, '../../../resources')

describe('FieldsetResolver', () => {
  const fs = new NodeFileSystemAdapter()
  const parser = new MarkdownYamlParser()
  const resolver = new FieldsetResolver(fs, parser, resourcesPath)

  describe('loadFieldset', () => {
    it('loads a fieldset and returns its field definitions', async () => {
      const fields = await resolver.loadFieldset('seo')

      expect(fields).toHaveLength(3)
      expect(fields[0].handle).toBe('meta_title')
      expect(fields[0].field.type).toBe('text')
      expect(fields[0].field.display).toBe('Meta Title')
      expect(fields[0].field.validate).toEqual(['max:60'])

      expect(fields[1].handle).toBe('meta_description')
      expect(fields[1].field.type).toBe('text')
      expect(fields[1].field.validate).toEqual(['max:160'])

      expect(fields[2].handle).toBe('og_image')
      expect(fields[2].field.type).toBe('asset')
    })

    it('throws an error for a non-existent fieldset', async () => {
      await expect(resolver.loadFieldset('nonexistent')).rejects.toThrow(
        'Fieldset "nonexistent" not found'
      )
    })

    it('resolves nested fieldset references', async () => {
      const fields = await resolver.loadFieldset('seo_full')

      // seo_full imports seo (3 fields) and social (3 fields)
      expect(fields).toHaveLength(6)
      expect(fields[0].handle).toBe('meta_title')
      expect(fields[1].handle).toBe('meta_description')
      expect(fields[2].handle).toBe('og_image')
      expect(fields[3].handle).toBe('name')
      expect(fields[4].handle).toBe('url')
      expect(fields[5].handle).toBe('icon')
    })

    it('detects circular references and throws an error', async () => {
      await expect(resolver.loadFieldset('circular_a')).rejects.toThrow(
        'Circular fieldset reference detected: circular_a -> circular_b -> circular_a'
      )
    })
  })

  describe('resolveBlueprint', () => {
    it('resolves import references in blueprint fields', async () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            display: 'Main',
            fields: [
              { handle: 'title', field: { type: 'text', required: true } },
              { import: 'seo' } as unknown as any,
            ],
          },
        },
      }

      const resolved = await resolver.resolveBlueprint(blueprint)

      expect(resolved.handle).toBe('test')
      expect(resolved.tabs.main.fields).toHaveLength(4)
      expect(resolved.tabs.main.fields[0].handle).toBe('title')
      expect(resolved.tabs.main.fields[0].field.type).toBe('text')
      expect(resolved.tabs.main.fields[1].handle).toBe('meta_title')
      expect(resolved.tabs.main.fields[2].handle).toBe('meta_description')
      expect(resolved.tabs.main.fields[3].handle).toBe('og_image')
    })

    it('preserves non-import fields unchanged', async () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { handle: 'title', field: { type: 'text', required: true, display: 'Title' } },
              { handle: 'slug', field: { type: 'slug' } },
            ],
          },
        },
      }

      const resolved = await resolver.resolveBlueprint(blueprint)

      expect(resolved.tabs.main.fields).toHaveLength(2)
      expect(resolved.tabs.main.fields[0].handle).toBe('title')
      expect(resolved.tabs.main.fields[0].field.required).toBe(true)
      expect(resolved.tabs.main.fields[1].handle).toBe('slug')
    })

    it('resolves imports in sections', async () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [{ handle: 'title', field: { type: 'text' } }],
            sections: {
              seo_section: {
                display: 'SEO',
                fields: [{ import: 'seo' } as unknown as any],
              },
            },
          },
        },
      }

      const resolved = await resolver.resolveBlueprint(blueprint)

      expect(resolved.tabs.main.sections!.seo_section.fields).toHaveLength(3)
      expect(resolved.tabs.main.sections!.seo_section.fields[0].handle).toBe('meta_title')
    })

    it('handles multiple imports in the same tab', async () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [
              { import: 'seo' } as unknown as any,
              { handle: 'divider', field: { type: 'hidden' } },
              { import: 'social' } as unknown as any,
            ],
          },
        },
      }

      const resolved = await resolver.resolveBlueprint(blueprint)

      // seo (3) + divider (1) + social (3) = 7
      expect(resolved.tabs.main.fields).toHaveLength(7)
      expect(resolved.tabs.main.fields[0].handle).toBe('meta_title')
      expect(resolved.tabs.main.fields[1].handle).toBe('meta_description')
      expect(resolved.tabs.main.fields[2].handle).toBe('og_image')
      expect(resolved.tabs.main.fields[3].handle).toBe('divider')
      expect(resolved.tabs.main.fields[4].handle).toBe('name')
      expect(resolved.tabs.main.fields[5].handle).toBe('url')
      expect(resolved.tabs.main.fields[6].handle).toBe('icon')
    })

    it('resolves nested imports through blueprint', async () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [{ import: 'seo_full' } as unknown as any],
          },
        },
      }

      const resolved = await resolver.resolveBlueprint(blueprint)

      expect(resolved.tabs.main.fields).toHaveLength(6)
      expect(resolved.tabs.main.fields[0].handle).toBe('meta_title')
      expect(resolved.tabs.main.fields[5].handle).toBe('icon')
    })

    it('detects circular references during blueprint resolution', async () => {
      const blueprint: Blueprint = {
        handle: 'test',
        tabs: {
          main: {
            fields: [{ import: 'circular_a' } as unknown as any],
          },
        },
      }

      await expect(resolver.resolveBlueprint(blueprint)).rejects.toThrow(
        'Circular fieldset reference detected'
      )
    })
  })
})
