import { describe, it, expect, beforeEach } from 'vitest'
import { TaxonomyOperations } from '@/lib/content/taxonomies'
import { InMemoryContentCache } from '@/lib/cache/store'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import { NotFoundError } from '@/lib/errors'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { MadoriConfig } from '@/lib/config/schema'

function createMockFs(files: Record<string, string> = {}): FileSystemAdapter {
  return {
    async readFile(filePath: string) {
      if (filePath in files) return files[filePath]
      throw new Error(`File not found: ${filePath}`)
    },
    async writeFile() {},
    async deleteFile() {},
    async exists(filePath: string) {
      // Check exact file match or directory match (any file starts with dir path)
      if (filePath in files) return true
      const dirPrefix = filePath.endsWith('/') ? filePath : filePath + '/'
      return Object.keys(files).some((f) => f.startsWith(dirPrefix))
    },
    async listFiles(directory: string, pattern?: string) {
      const dirPrefix = directory.endsWith('/') ? directory : directory + '/'
      const matching = Object.keys(files)
        .filter((f) => f.startsWith(dirPrefix))
        .map((f) => f.slice(dirPrefix.length))

      if (pattern === '*.yaml') {
        return matching.filter((f) => f.endsWith('.yaml') && !f.includes('/'))
      }
      return matching
    },
    async listDirectories() {
      return []
    },
    async mkdir() {},
    async copyFile() {},
    async moveFile() {},
  }
}

function createConfig(): MadoriConfig {
  return {
    contentPath: '/project/content',
    resourcesPath: '/project/resources',
    usersPath: '/project/users',
    assetsPath: '/project/public/assets',
    cp: { enabled: true, path: '/cp' },
    graphql: { enabled: true, path: '/api/graphql', introspection: true },
    auth: { driver: 'password', store: 'file', provider: 'yaml' },
  }
}

describe('TaxonomyOperations', () => {
  let cache: InMemoryContentCache
  let parser: MarkdownYamlParser

  beforeEach(() => {
    cache = new InMemoryContentCache()
    parser = new MarkdownYamlParser()
  })

  describe('getTaxonomy', () => {
    it('returns taxonomy from definition file', async () => {
      const files: Record<string, string> = {
        '/project/resources/taxonomies/categories.yaml': 'title: Categories\n',
      }
      const ops = new TaxonomyOperations(createConfig(), createMockFs(files), parser, cache)

      const result = await ops.getTaxonomy('categories')
      expect(result).toEqual({
        handle: 'categories',
        title: 'Categories',
        blueprint: undefined,
      })
    })

    it('returns taxonomy with blueprint', async () => {
      const files: Record<string, string> = {
        '/project/resources/taxonomies/tags.yaml': 'title: Tags\nblueprint: tag\n',
      }
      const ops = new TaxonomyOperations(createConfig(), createMockFs(files), parser, cache)

      const result = await ops.getTaxonomy('tags')
      expect(result).toEqual({
        handle: 'tags',
        title: 'Tags',
        blueprint: 'tag',
      })
    })

    it('returns null for non-existent taxonomy', async () => {
      const ops = new TaxonomyOperations(createConfig(), createMockFs(), parser, cache)

      const result = await ops.getTaxonomy('nonexistent')
      expect(result).toBeNull()
    })

    it('caches taxonomy on subsequent calls', async () => {
      const files: Record<string, string> = {
        '/project/resources/taxonomies/categories.yaml': 'title: Categories\n',
      }
      const ops = new TaxonomyOperations(createConfig(), createMockFs(files), parser, cache)

      const first = await ops.getTaxonomy('categories')
      const second = await ops.getTaxonomy('categories')
      expect(first).toEqual(second)
    })
  })

  describe('listTaxonomies', () => {
    it('returns all taxonomies from definition files', async () => {
      const files: Record<string, string> = {
        '/project/resources/taxonomies/categories.yaml': 'title: Categories\n',
        '/project/resources/taxonomies/tags.yaml': 'title: Tags\n',
      }
      const ops = new TaxonomyOperations(createConfig(), createMockFs(files), parser, cache)

      const result = await ops.listTaxonomies()
      expect(result).toHaveLength(2)
      expect(result).toContainEqual({
        handle: 'categories',
        title: 'Categories',
        blueprint: undefined,
      })
      expect(result).toContainEqual({
        handle: 'tags',
        title: 'Tags',
        blueprint: undefined,
      })
    })

    it('returns empty array when no taxonomy definitions exist', async () => {
      const ops = new TaxonomyOperations(createConfig(), createMockFs(), parser, cache)

      const result = await ops.listTaxonomies()
      expect(result).toEqual([])
    })

    it('caches list on subsequent calls', async () => {
      const files: Record<string, string> = {
        '/project/resources/taxonomies/categories.yaml': 'title: Categories\n',
      }
      const ops = new TaxonomyOperations(createConfig(), createMockFs(files), parser, cache)

      const first = await ops.listTaxonomies()
      const second = await ops.listTaxonomies()
      expect(first).toEqual(second)
    })
  })

  describe('getTerm', () => {
    it('reads and parses a term YAML file', async () => {
      const files: Record<string, string> = {
        '/project/resources/taxonomies/categories.yaml': 'title: Categories\n',
        '/project/content/taxonomies/categories/updates.yaml':
          'title: Updates\nslug: updates\ndescription: Product updates and announcements\n',
      }
      const ops = new TaxonomyOperations(createConfig(), createMockFs(files), parser, cache)

      const result = await ops.getTerm('categories', 'updates')
      expect(result).toEqual({
        title: 'Updates',
        slug: 'updates',
        taxonomy: 'categories',
        description: 'Product updates and announcements',
        data: {},
      })
    })

    it('returns null for non-existent term', async () => {
      const files: Record<string, string> = {
        '/project/resources/taxonomies/categories.yaml': 'title: Categories\n',
      }
      const ops = new TaxonomyOperations(createConfig(), createMockFs(files), parser, cache)

      const result = await ops.getTerm('categories', 'nonexistent')
      expect(result).toBeNull()
    })

    it('throws NotFoundError for non-existent taxonomy', async () => {
      const ops = new TaxonomyOperations(createConfig(), createMockFs(), parser, cache)

      await expect(ops.getTerm('nonexistent', 'slug')).rejects.toThrow(NotFoundError)
    })

    it('uses slug from filename when not in YAML', async () => {
      const files: Record<string, string> = {
        '/project/resources/taxonomies/tags.yaml': 'title: Tags\n',
        '/project/content/taxonomies/tags/javascript.yaml':
          'title: JavaScript\ndescription: JS related content\n',
      }
      const ops = new TaxonomyOperations(createConfig(), createMockFs(files), parser, cache)

      const result = await ops.getTerm('tags', 'javascript')
      expect(result).toEqual({
        title: 'JavaScript',
        slug: 'javascript',
        taxonomy: 'tags',
        description: 'JS related content',
        data: {},
      })
    })

    it('includes custom fields in data', async () => {
      const files: Record<string, string> = {
        '/project/resources/taxonomies/categories.yaml': 'title: Categories\n',
        '/project/content/taxonomies/categories/tech.yaml':
          'title: Technology\nslug: tech\ndescription: Tech posts\ncolor: "#3498db"\nicon: cpu\n',
      }
      const ops = new TaxonomyOperations(createConfig(), createMockFs(files), parser, cache)

      const result = await ops.getTerm('categories', 'tech')
      expect(result).toEqual({
        title: 'Technology',
        slug: 'tech',
        taxonomy: 'categories',
        description: 'Tech posts',
        data: { color: '#3498db', icon: 'cpu' },
      })
    })

    it('caches term on subsequent calls', async () => {
      const files: Record<string, string> = {
        '/project/resources/taxonomies/categories.yaml': 'title: Categories\n',
        '/project/content/taxonomies/categories/updates.yaml':
          'title: Updates\nslug: updates\n',
      }
      const ops = new TaxonomyOperations(createConfig(), createMockFs(files), parser, cache)

      const first = await ops.getTerm('categories', 'updates')
      const second = await ops.getTerm('categories', 'updates')
      expect(first).toEqual(second)
    })
  })

  describe('listTerms', () => {
    it('lists all terms in a taxonomy directory', async () => {
      const files: Record<string, string> = {
        '/project/resources/taxonomies/categories.yaml': 'title: Categories\n',
        '/project/content/taxonomies/categories/updates.yaml':
          'title: Updates\nslug: updates\n',
        '/project/content/taxonomies/categories/tutorials.yaml':
          'title: Tutorials\nslug: tutorials\ndescription: How-to guides\n',
      }
      const ops = new TaxonomyOperations(createConfig(), createMockFs(files), parser, cache)

      const result = await ops.listTerms('categories')
      expect(result).toHaveLength(2)
      expect(result).toContainEqual({
        title: 'Updates',
        slug: 'updates',
        taxonomy: 'categories',
        description: undefined,
        data: {},
      })
      expect(result).toContainEqual({
        title: 'Tutorials',
        slug: 'tutorials',
        taxonomy: 'categories',
        description: 'How-to guides',
        data: {},
      })
    })

    it('returns empty array when taxonomy directory does not exist', async () => {
      const files: Record<string, string> = {
        '/project/resources/taxonomies/categories.yaml': 'title: Categories\n',
      }
      const ops = new TaxonomyOperations(createConfig(), createMockFs(files), parser, cache)

      const result = await ops.listTerms('categories')
      expect(result).toEqual([])
    })

    it('throws NotFoundError for non-existent taxonomy', async () => {
      const ops = new TaxonomyOperations(createConfig(), createMockFs(), parser, cache)

      await expect(ops.listTerms('nonexistent')).rejects.toThrow(NotFoundError)
    })

    it('caches term list on subsequent calls', async () => {
      const files: Record<string, string> = {
        '/project/resources/taxonomies/tags.yaml': 'title: Tags\n',
        '/project/content/taxonomies/tags/react.yaml': 'title: React\nslug: react\n',
      }
      const ops = new TaxonomyOperations(createConfig(), createMockFs(files), parser, cache)

      const first = await ops.listTerms('tags')
      const second = await ops.listTerms('tags')
      expect(first).toEqual(second)
    })
  })
})
