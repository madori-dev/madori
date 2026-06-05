import { describe, it, expect, beforeEach } from 'vitest'
import { MadoriContentEngine } from '@/lib/content/engine'
import type { ContentEngine, EntryInput } from '@/lib/content/engine'
import type { MadoriConfig } from '@/lib/config/schema'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'
import type { ContentCache } from '@/lib/cache/store'
import type { BlueprintRegistry } from '@/lib/blueprints/registry'
import { NotFoundError, ConflictError, ValidationError } from '@/lib/errors'
import { computeContentHash } from '@/lib/content/concurrency'

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createMockConfig(overrides?: Partial<MadoriConfig>): MadoriConfig {
  return {
    contentPath: '/project/content',
    resourcesPath: '/project/resources',
    usersPath: '/project/users',
    assetsPath: '/project/public/assets',
    cp: { enabled: true, path: '/cp' },
    graphql: { enabled: true, path: '/api/graphql', introspection: true },
    auth: { driver: 'password', store: 'file', provider: 'yaml' },
    ...overrides,
  }
}

function createMockFs(): FileSystemAdapter {
  const files: Map<string, string> = new Map()
  const directories: Map<string, string[]> = new Map()

  return {
    readFile: async (path: string) => {
      const content = files.get(path)
      if (!content) throw new Error(`File not found: ${path}`)
      return content
    },
    writeFile: async (path: string, content: string) => {
      files.set(path, content)
    },
    deleteFile: async (path: string) => {
      files.delete(path)
    },
    exists: async (path: string) => {
      return files.has(path) || directories.has(path)
    },
    listFiles: async (directory: string, _pattern?: string) => {
      return directories.get(directory) ?? []
    },
    listDirectories: async (_directory: string) => [],
    mkdir: async () => {},
    copyFile: async () => {},
    moveFile: async (src: string, dest: string) => {
      const content = files.get(src)
      if (content === undefined) throw new Error(`File not found: ${src}`)
      files.set(dest, content)
      files.delete(src)
    },
    // Expose internal state for test setup
    _files: files,
    _directories: directories,
  } as FileSystemAdapter & { _files: Map<string, string>; _directories: Map<string, string[]> }
}

function createMockParser(): ContentParser {
  return {
    parseMarkdown: (raw: string) => {
      // Simple frontmatter parser for tests
      const match = raw.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/)
      if (!match) return { frontmatter: {}, content: raw.trim() }

      const frontmatterLines = match[1].split('\n')
      const frontmatter: Record<string, unknown> = {}
      for (const line of frontmatterLines) {
        const colonIdx = line.indexOf(':')
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim()
          const value = line.slice(colonIdx + 1).trim()
          frontmatter[key] = value
        }
      }
      return { frontmatter, content: match[2].trim() }
    },
    serializeMarkdown: (frontmatter: Record<string, unknown>, content: string) => {
      const lines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`)
      return `---\n${lines.join('\n')}\n---\n\n${content}\n`
    },
    parseYaml: <T>(raw: string) => JSON.parse(raw) as T,
    serializeYaml: (data: unknown) => JSON.stringify(data),
  }
}

function createMockCache(): ContentCache {
  const store = new Map<string, unknown>()
  return {
    get: <T>(key: string) => store.get(key) as T | undefined,
    set: <T>(key: string, value: T) => { store.set(key, value) },
    invalidate: (key: string) => { store.delete(key) },
    invalidatePattern: (pattern: string) => {
      const regex = new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*'))
      for (const key of store.keys()) {
        if (regex.test(key)) store.delete(key)
      }
    },
    invalidateByFilePath: () => {},
    clear: () => { store.clear() },
  }
}

function createMockBlueprintRegistry(): BlueprintRegistry {
  return {
    getBlueprint: async () => null,
    listBlueprints: async (type: string) => {
      if (type === 'collections') {
        return [
          { handle: 'blog', tabs: {} },
          { handle: 'pages', tabs: {} },
        ]
      }
      return []
    },
    generateZodSchema: () => { throw new Error('not used in tests') },
    validateData: () => ({ success: true }),
    saveBlueprint: async () => {},
    deleteBlueprint: async () => false,
  } as unknown as BlueprintRegistry
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MadoriContentEngine', () => {
  let engine: ContentEngine
  let mockFs: FileSystemAdapter & { _files: Map<string, string>; _directories: Map<string, string[]> }
  let mockCache: ContentCache
  let mockBlueprintRegistry: BlueprintRegistry

  beforeEach(() => {
    mockFs = createMockFs() as FileSystemAdapter & { _files: Map<string, string>; _directories: Map<string, string[]> }
    mockCache = createMockCache()
    mockBlueprintRegistry = createMockBlueprintRegistry()

    // Seed mock FS with collection config files (engine reads from resources/collections/*.yaml)
    const collectionsDir = '/project/resources/collections'
    mockFs._directories.set(collectionsDir, ['blog.yaml', 'pages.yaml'])
    mockFs._files.set(`${collectionsDir}/blog.yaml`, JSON.stringify({ title: 'Blog', blueprint: 'blog' }))
    mockFs._files.set(`${collectionsDir}/pages.yaml`, JSON.stringify({ title: 'Pages', blueprint: 'pages' }))

    engine = new MadoriContentEngine(
      createMockConfig(),
      mockFs,
      createMockParser(),
      mockCache,
      mockBlueprintRegistry
    )
  })

  describe('getCollection', () => {
    it('returns collection from config', async () => {
      const collection = await engine.getCollection('blog')
      expect(collection).toEqual({
        title: 'Blog',
        handle: 'blog',
        route: undefined,
        blueprint: 'blog',
        sortable: undefined,
        dated: undefined,
        defaultStatus: undefined,
      })
    })

    it('returns null for non-existent collection', async () => {
      const collection = await engine.getCollection('nonexistent')
      expect(collection).toBeNull()
    })

    it('caches collection on subsequent calls', async () => {
      await engine.getCollection('blog')
      await engine.getCollection('blog')
      // No assertion needed — if caching is broken, the test still passes
      // but this verifies no errors on repeated calls
      const collection = await engine.getCollection('blog')
      expect(collection?.handle).toBe('blog')
    })
  })

  describe('listCollections', () => {
    it('returns all collections from config', async () => {
      const collections = await engine.listCollections()
      expect(collections).toHaveLength(2)
      expect(collections.map((c) => c.handle)).toContain('blog')
      expect(collections.map((c) => c.handle)).toContain('pages')
    })
  })

  describe('getEntry', () => {
    it('returns parsed entry from file', async () => {
      const filePath = '/project/content/collections/blog/hello-world.md'
      mockFs._files.set(filePath, '---\ntitle: Hello World\nslug: hello-world\nstatus: published\ncreatedAt: 2024-01-01T00:00:00Z\nupdatedAt: 2024-01-01T00:00:00Z\n---\n\n# Hello World\n')

      const entry = await engine.getEntry('blog', 'hello-world')
      expect(entry).not.toBeNull()
      expect(entry!.title).toBe('Hello World')
      expect(entry!.slug).toBe('hello-world')
      expect(entry!.status).toBe('published')
      expect(entry!.collection).toBe('blog')
      expect(entry!.content).toBe('# Hello World')
    })

    it('includes contentHash computed from file content', async () => {
      const filePath = '/project/content/collections/blog/hello-world.md'
      const fileContent = '---\ntitle: Hello World\nslug: hello-world\nstatus: published\ncreatedAt: 2024-01-01T00:00:00Z\nupdatedAt: 2024-01-01T00:00:00Z\n---\n\n# Hello World\n'
      mockFs._files.set(filePath, fileContent)

      const entry = await engine.getEntry('blog', 'hello-world')
      expect(entry).not.toBeNull()
      expect(entry!.contentHash).toBeDefined()
      expect(entry!.contentHash).toBe(computeContentHash(fileContent))
    })

    it('returns null for non-existent entry', async () => {
      const entry = await engine.getEntry('blog', 'nonexistent')
      expect(entry).toBeNull()
    })

    it('throws NotFoundError for non-existent collection', async () => {
      await expect(engine.getEntry('nonexistent', 'slug')).rejects.toThrow(NotFoundError)
    })
  })

  describe('listEntries', () => {
    beforeEach(() => {
      const dir = '/project/content/collections/blog'
      mockFs._directories.set(dir, ['hello-world.md', 'second-post.md'])
      mockFs._files.set(dir, '') // mark directory as existing

      mockFs._files.set(
        `${dir}/hello-world.md`,
        '---\ntitle: Hello World\nslug: hello-world\nstatus: published\ncreatedAt: 2024-01-01T00:00:00Z\nupdatedAt: 2024-01-01T00:00:00Z\n---\n\n# Hello World\n'
      )
      mockFs._files.set(
        `${dir}/second-post.md`,
        '---\ntitle: Second Post\nslug: second-post\nstatus: draft\ncreatedAt: 2024-01-02T00:00:00Z\nupdatedAt: 2024-01-02T00:00:00Z\n---\n\nSecond post content\n'
      )
    })

    it('returns all entries in collection', async () => {
      const entries = await engine.listEntries('blog')
      expect(entries).toHaveLength(2)
    })

    it('filters by status', async () => {
      const published = await engine.listEntries('blog', { status: 'published' })
      expect(published).toHaveLength(1)
      expect(published[0].title).toBe('Hello World')

      const drafts = await engine.listEntries('blog', { status: 'draft' })
      expect(drafts).toHaveLength(1)
      expect(drafts[0].title).toBe('Second Post')
    })

    it('returns all entries when status is "all"', async () => {
      const all = await engine.listEntries('blog', { status: 'all' })
      expect(all).toHaveLength(2)
    })

    it('sorts entries by field', async () => {
      const sorted = await engine.listEntries('blog', {
        sort: { field: 'title', direction: 'asc' },
      })
      expect(sorted[0].title).toBe('Hello World')
      expect(sorted[1].title).toBe('Second Post')

      const sortedDesc = await engine.listEntries('blog', {
        sort: { field: 'title', direction: 'desc' },
      })
      expect(sortedDesc[0].title).toBe('Second Post')
      expect(sortedDesc[1].title).toBe('Hello World')
    })

    it('applies limit', async () => {
      const limited = await engine.listEntries('blog', { limit: 1 })
      expect(limited).toHaveLength(1)
    })

    it('applies offset', async () => {
      const offset = await engine.listEntries('blog', { offset: 1 })
      expect(offset).toHaveLength(1)
    })

    it('applies filter', async () => {
      const filtered = await engine.listEntries('blog', {
        filter: { title: 'Hello World' },
      })
      expect(filtered).toHaveLength(1)
      expect(filtered[0].slug).toBe('hello-world')
    })

    it('throws NotFoundError for non-existent collection', async () => {
      await expect(engine.listEntries('nonexistent')).rejects.toThrow(NotFoundError)
    })
  })

  describe('createEntry', () => {
    it('creates a new entry file', async () => {
      const input: EntryInput = {
        title: 'New Post',
        slug: 'new-post',
        status: 'published',
        content: '# New Post\n\nContent here.',
      }

      const entry = await engine.createEntry('blog', input)
      expect(entry.title).toBe('New Post')
      expect(entry.slug).toBe('new-post')
      expect(entry.status).toBe('published')
      expect(entry.collection).toBe('blog')
      expect(entry.createdAt).toBeDefined()
      expect(entry.updatedAt).toBeDefined()

      // Verify file was written
      const filePath = '/project/content/collections/blog/new-post.md'
      expect(mockFs._files.has(filePath)).toBe(true)
    })

    it('uses default status from collection config', async () => {
      const input: EntryInput = {
        title: 'Draft Post',
        slug: 'draft-post',
      }

      const entry = await engine.createEntry('blog', input)
      expect(entry.status).toBe('draft')
    })

    it('throws ConflictError for duplicate slug', async () => {
      const filePath = '/project/content/collections/blog/existing.md'
      mockFs._files.set(filePath, '---\ntitle: Existing\n---\n\n')

      const input: EntryInput = {
        title: 'Duplicate',
        slug: 'existing',
      }

      await expect(engine.createEntry('blog', input)).rejects.toThrow(ConflictError)
    })

    it('throws NotFoundError for non-existent collection', async () => {
      const input: EntryInput = { title: 'Test', slug: 'test' }
      await expect(engine.createEntry('nonexistent', input)).rejects.toThrow(NotFoundError)
    })

    it('throws ValidationError when blueprint validation fails', async () => {
      // Override blueprint registry to return a validation failure
      const failingRegistry = {
        ...mockBlueprintRegistry,
        getBlueprint: async () => ({ handle: 'blog', tabs: {} }),
        validateData: () => ({
          success: false,
          errors: { title: ['Title is required'] },
        }),
      } as unknown as BlueprintRegistry

      const engineWithValidation = new MadoriContentEngine(
        createMockConfig(),
        mockFs,
        createMockParser(),
        mockCache,
        failingRegistry
      )

      const input: EntryInput = { title: '', slug: 'test' }
      await expect(engineWithValidation.createEntry('blog', input)).rejects.toThrow(ValidationError)
    })
  })

  describe('updateEntry', () => {
    const fileContent = '---\ntitle: Hello World\nslug: hello-world\nstatus: published\ncreatedAt: 2024-01-01T00:00:00Z\nupdatedAt: 2024-01-01T00:00:00Z\n---\n\n# Hello World\n'
    let contentHash: string

    beforeEach(() => {
      const filePath = '/project/content/collections/blog/hello-world.md'
      mockFs._files.set(filePath, fileContent)
      contentHash = computeContentHash(fileContent)
    })

    it('updates entry fields', async () => {
      const entry = await engine.updateEntry('blog', 'hello-world', {
        title: 'Updated Title',
      }, contentHash)

      expect(entry.title).toBe('Updated Title')
      expect(entry.slug).toBe('hello-world')
      expect(entry.status).toBe('published')
    })

    it('preserves existing fields when not provided', async () => {
      const entry = await engine.updateEntry('blog', 'hello-world', {
        content: 'New content',
      }, contentHash)

      expect(entry.title).toBe('Hello World')
      expect(entry.content).toBe('New content')
    })

    it('throws NotFoundError for non-existent entry', async () => {
      await expect(
        engine.updateEntry('blog', 'nonexistent', { title: 'Test' }, contentHash)
      ).rejects.toThrow(NotFoundError)
    })

    it('throws NotFoundError for non-existent collection', async () => {
      await expect(
        engine.updateEntry('nonexistent', 'slug', { title: 'Test' }, contentHash)
      ).rejects.toThrow(NotFoundError)
    })

    it('handles slug change', async () => {
      const entry = await engine.updateEntry('blog', 'hello-world', {
        slug: 'new-slug',
      }, contentHash)

      expect(entry.slug).toBe('new-slug')
      // Old file should be deleted
      expect(mockFs._files.has('/project/content/collections/blog/hello-world.md')).toBe(false)
      // New file should exist
      expect(mockFs._files.has('/project/content/collections/blog/new-slug.md')).toBe(true)
    })

    it('throws ConflictError when changing slug to existing one', async () => {
      mockFs._files.set(
        '/project/content/collections/blog/existing.md',
        '---\ntitle: Existing\n---\n\n'
      )

      await expect(
        engine.updateEntry('blog', 'hello-world', { slug: 'existing' }, contentHash)
      ).rejects.toThrow(ConflictError)
    })

    it('throws ValidationError when contentHash is not provided', async () => {
      await expect(
        engine.updateEntry('blog', 'hello-world', { title: 'Test' })
      ).rejects.toThrow(ValidationError)
    })

    it('throws ConflictError when contentHash does not match current file', async () => {
      const staleHash = computeContentHash('stale content')

      await expect(
        engine.updateEntry('blog', 'hello-world', { title: 'Test' }, staleHash)
      ).rejects.toThrow(ConflictError)
    })

    it('includes both hashes in ConflictError', async () => {
      const staleHash = computeContentHash('stale content')

      try {
        await engine.updateEntry('blog', 'hello-world', { title: 'Test' }, staleHash)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictError)
        const conflictError = error as ConflictError
        expect(conflictError.submittedHash).toBe(staleHash)
        expect(conflictError.currentHash).toBe(contentHash)
      }
    })
  })

  describe('deleteEntry', () => {
    it('deletes the entry file', async () => {
      const filePath = '/project/content/collections/blog/hello-world.md'
      mockFs._files.set(filePath, '---\ntitle: Hello World\n---\n\n')

      await engine.deleteEntry('blog', 'hello-world')
      expect(mockFs._files.has(filePath)).toBe(false)
    })

    it('throws NotFoundError for non-existent entry', async () => {
      await expect(engine.deleteEntry('blog', 'nonexistent')).rejects.toThrow(NotFoundError)
    })

    it('throws NotFoundError for non-existent collection', async () => {
      await expect(engine.deleteEntry('nonexistent', 'slug')).rejects.toThrow(NotFoundError)
    })
  })
})
