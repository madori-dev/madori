import { describe, it, expect } from 'vitest'
import { BlueprintLoader } from '@/lib/blueprints/loader'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import * as path from 'path'

const resourcesPath = path.resolve(__dirname, '../../../resources')

describe('BlueprintLoader', () => {
  const fs = new NodeFileSystemAdapter()
  const parser = new MarkdownYamlParser()
  const loader = new BlueprintLoader(fs, parser, resourcesPath)

  describe('loadBlueprint', () => {
    it('loads an existing blueprint and derives handle from filename', async () => {
      const blueprint = await loader.loadBlueprint('collections', 'docs')

      expect(blueprint).not.toBeNull()
      expect(blueprint!.handle).toBe('docs')
    })

    it('parses tabs from the YAML structure', async () => {
      const blueprint = await loader.loadBlueprint('collections', 'docs')

      expect(blueprint!.tabs).toHaveProperty('main')
      expect(blueprint!.tabs.main.fields).toBeInstanceOf(Array)
      expect(blueprint!.tabs.main.fields.length).toBe(3)
    })

    it('parses field definitions with handle and field config', async () => {
      const blueprint = await loader.loadBlueprint('collections', 'docs')
      const fields = blueprint!.tabs.main.fields

      expect(fields[0].handle).toBe('title')
      expect(fields[0].field.type).toBe('text')
      expect(fields[0].field.required).toBe(true)

      expect(fields[1].handle).toBe('slug')
      expect(fields[1].field.type).toBe('slug')

      expect(fields[2].handle).toBe('content')
      expect(fields[2].field.type).toBe('tiptap')
    })

    it('returns null for a non-existent blueprint', async () => {
      const blueprint = await loader.loadBlueprint('collections', 'nonexistent')
      expect(blueprint).toBeNull()
    })

    it('returns null for an invalid blueprint that fails validation', async () => {
      // Create a mock loader with an invalid YAML that will fail validation
      const mockFs = {
        ...fs,
        exists: async () => true,
        readFile: async () => 'not_a_valid_blueprint: true',
      } as unknown as typeof fs
      const invalidLoader = new BlueprintLoader(mockFs, parser, resourcesPath)

      const blueprint = await invalidLoader.loadBlueprint('collections', 'invalid')
      expect(blueprint).toBeNull()
    })
  })

  describe('listBlueprints', () => {
    it('lists all blueprints in a type directory', async () => {
      const blueprints = await loader.listBlueprints('collections')

      expect(blueprints.length).toBeGreaterThanOrEqual(1)
      expect(blueprints.some((b) => b.handle === 'docs')).toBe(true)
    })

    it('returns empty array for non-existent type directory', async () => {
      const blueprints = await loader.listBlueprints('taxonomies' as any)
      // taxonomies directory exists, so this tests a type with at least one blueprint
      // Use a truly non-existent type
      const empty = await loader.listBlueprints('nonexistent_type' as any)
      expect(empty).toEqual([])
    })
  })
})
