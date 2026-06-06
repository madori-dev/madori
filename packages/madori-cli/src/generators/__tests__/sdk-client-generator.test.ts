import { describe, it, expect, beforeEach } from 'vitest'
import { SDKClientGenerator } from '../sdk-client-generator.js'
import type { Blueprint } from '@madori/lib/blueprints/types.js'

describe('SDKClientGenerator', () => {
  let generator: SDKClientGenerator

  beforeEach(() => {
    generator = new SDKClientGenerator()
  })

  describe('generate', () => {
    it('produces a single client.ts file', () => {
      const blueprints: Blueprint[] = [
        { handle: 'blog', tabs: { main: { fields: [{ handle: 'title', field: { type: 'text', required: true } }] } } },
      ]
      const result = generator.generate(blueprints)
      expect(result.filename).toBe('client.ts')
    })

    it('imports createClient from @madori/sdk', () => {
      const blueprints: Blueprint[] = [
        { handle: 'blog', tabs: { main: { fields: [] } } },
      ]
      const result = generator.generate(blueprints)
      expect(result.content).toContain("import { createClient } from '@madori/sdk'")
    })

    it('imports generated type for each blueprint', () => {
      const blueprints: Blueprint[] = [
        { handle: 'blog', tabs: { main: { fields: [] } } },
        { handle: 'pages', tabs: { main: { fields: [] } } },
      ]
      const result = generator.generate(blueprints)
      expect(result.content).toContain("import type { BlogEntry } from './types/blog.js'")
      expect(result.content).toContain("import type { PagesEntry } from './types/pages.js'")
    })

    it('generates CollectionTypeMap interface mapping handles to types', () => {
      const blueprints: Blueprint[] = [
        { handle: 'blog', tabs: { main: { fields: [] } } },
        { handle: 'pages', tabs: { main: { fields: [] } } },
      ]
      const result = generator.generate(blueprints)
      expect(result.content).toContain('export interface CollectionTypeMap {')
      expect(result.content).toContain('  blog: BlogEntry')
      expect(result.content).toContain('  pages: PagesEntry')
    })

    it('exports a configured typed client instance', () => {
      const blueprints: Blueprint[] = [
        { handle: 'blog', tabs: { main: { fields: [] } } },
      ]
      const result = generator.generate(blueprints)
      expect(result.content).toContain('export const madoriClient = createClient<CollectionTypeMap>({')
      expect(result.content).toContain("contentPath: 'content'")
      expect(result.content).toContain("resourcesPath: 'resources'")
    })

    it('exports CollectionTypeMap type', () => {
      const blueprints: Blueprint[] = [
        { handle: 'blog', tabs: { main: { fields: [] } } },
      ]
      const result = generator.generate(blueprints)
      expect(result.content).toContain('export type { CollectionTypeMap }')
    })

    it('handles kebab-case collection handles', () => {
      const blueprints: Blueprint[] = [
        { handle: 'getting-started', tabs: { main: { fields: [] } } },
      ]
      const result = generator.generate(blueprints)
      expect(result.content).toContain("import type { GettingStartedEntry } from './types/getting-started.js'")
      expect(result.content).toContain('  getting-started: GettingStartedEntry')
    })

    it('handles empty blueprints array', () => {
      const result = generator.generate([])
      expect(result.filename).toBe('client.ts')
      expect(result.content).toContain("import { createClient } from '@madori/sdk'")
      expect(result.content).toContain('export interface CollectionTypeMap {')
      expect(result.content).toContain('}')
      expect(result.content).toContain('export const madoriClient = createClient<CollectionTypeMap>({')
    })

    it('generates complete expected output for multiple collections', () => {
      const blueprints: Blueprint[] = [
        { handle: 'blog', tabs: { main: { fields: [{ handle: 'title', field: { type: 'text', required: true } }] } } },
        { handle: 'pages', tabs: { main: { fields: [{ handle: 'body', field: { type: 'tiptap' } }] } } },
      ]
      const result = generator.generate(blueprints)

      const expected = [
        "import { createClient } from '@madori/sdk'",
        "import type { BlogEntry } from './types/blog.js'",
        "import type { PagesEntry } from './types/pages.js'",
        '',
        'export interface CollectionTypeMap {',
        '  blog: BlogEntry',
        '  pages: PagesEntry',
        '}',
        '',
        'export const madoriClient = createClient<CollectionTypeMap>({',
        "  contentPath: 'content',",
        "  resourcesPath: 'resources',",
        '})',
        '',
        'export type { CollectionTypeMap }',
        '',
      ].join('\n')

      expect(result.content).toBe(expected)
    })
  })
})
