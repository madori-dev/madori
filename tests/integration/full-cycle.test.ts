import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import { InMemoryContentCache } from '@/lib/cache/store'
import { BlueprintLoader } from '@/lib/blueprints/loader'
import { BlueprintRegistry } from '@/lib/blueprints/registry'
import { MadoriContentEngine } from '@/lib/content/engine'
import { ChokidarFileWatcher } from '@/lib/cache/watcher'
import { buildResolvers, type GraphQLContext } from '@/lib/graphql/resolvers'
import type { MadoriConfig } from '@/lib/config/schema'

/**
 * Integration tests for the full MADORI request cycle.
 *
 * These tests use real file system operations in a temp directory
 * with real MadoriContentEngine, FileSystemAdapter, ContentParser, and ContentCache.
 *
 * Validates: Requirements 5.1, 6.1, 12.1
 */

function createTestConfig(tempDir: string): MadoriConfig {
  return {
    contentPath: path.join(tempDir, 'content'),
    resourcesPath: path.join(tempDir, 'resources'),
    usersPath: path.join(tempDir, 'users'),
    assetsPath: path.join(tempDir, 'public/assets'),
    cp: { enabled: true, path: '/cp' },
    graphql: { enabled: true, path: '/api/graphql', introspection: true },
    collections: {
      blog: {
        title: 'Blog',
        handle: 'blog',
        route: '/blog/{slug}',
        blueprint: 'blog',
        sortable: false,
        dated: true,
        defaultStatus: 'draft',
      },
    },
    taxonomies: {},
    globals: {},
    navigations: [],
  }
}

function setupTempDir(tempDir: string): void {
  // Create content structure
  fs.mkdirSync(path.join(tempDir, 'content/collections/blog'), { recursive: true })
  fs.mkdirSync(path.join(tempDir, 'content/globals'), { recursive: true })
  fs.mkdirSync(path.join(tempDir, 'content/navigation'), { recursive: true })
  fs.mkdirSync(path.join(tempDir, 'content/taxonomies'), { recursive: true })
  fs.mkdirSync(path.join(tempDir, 'content/forms'), { recursive: true })
  fs.mkdirSync(path.join(tempDir, 'resources/blueprints/collections'), { recursive: true })
  fs.mkdirSync(path.join(tempDir, 'resources/fieldsets'), { recursive: true })
  fs.mkdirSync(path.join(tempDir, 'users'), { recursive: true })
  fs.mkdirSync(path.join(tempDir, 'public/assets'), { recursive: true })

  // Create a minimal blog blueprint (no required fields beyond title/slug)
  const blueprintYaml = `tabs:
  main:
    display: Main
    fields:
      - handle: title
        field:
          type: text
          required: true
      - handle: slug
        field:
          type: slug
      - handle: content
        field:
          type: markdown
`
  fs.writeFileSync(
    path.join(tempDir, 'resources/blueprints/collections/blog.yaml'),
    blueprintYaml
  )
}

describe('Full Cycle Integration: Content Engine write → read', () => {
  let tempDir: string
  let engine: MadoriContentEngine
  let cache: InMemoryContentCache

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'madori-integration-'))
    setupTempDir(tempDir)

    const config = createTestConfig(tempDir)
    const fsAdapter = new NodeFileSystemAdapter()
    const parser = new MarkdownYamlParser()
    cache = new InMemoryContentCache()
    const blueprintLoader = new BlueprintLoader(fsAdapter, parser, config.resourcesPath)
    const blueprintRegistry = new BlueprintRegistry(blueprintLoader)

    engine = new MadoriContentEngine(config, fsAdapter, parser, cache, blueprintRegistry)
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('creates, reads, updates, and deletes an entry through the Content Engine', async () => {
    // 1. Create an entry
    const created = await engine.createEntry('blog', {
      title: 'Integration Test Post',
      slug: 'integration-test',
      status: 'published',
      content: '# Hello\n\nThis is a test post.',
    })

    expect(created.title).toBe('Integration Test Post')
    expect(created.slug).toBe('integration-test')
    expect(created.status).toBe('published')
    expect(created.content).toBe('# Hello\n\nThis is a test post.')

    // 2. Read it back
    const read = await engine.getEntry('blog', 'integration-test')
    expect(read).not.toBeNull()
    expect(read!.title).toBe('Integration Test Post')
    expect(read!.slug).toBe('integration-test')
    expect(read!.status).toBe('published')
    expect(read!.content).toBe('# Hello\n\nThis is a test post.')

    // 3. Update the entry
    const updated = await engine.updateEntry('blog', 'integration-test', {
      title: 'Updated Title',
      content: '# Updated\n\nNew content here.',
    })

    expect(updated.title).toBe('Updated Title')
    expect(updated.content).toBe('# Updated\n\nNew content here.')
    expect(updated.slug).toBe('integration-test')

    // 4. Read updated entry
    const readUpdated = await engine.getEntry('blog', 'integration-test')
    expect(readUpdated).not.toBeNull()
    expect(readUpdated!.title).toBe('Updated Title')
    expect(readUpdated!.content).toBe('# Updated\n\nNew content here.')

    // 5. Delete the entry
    await engine.deleteEntry('blog', 'integration-test')

    // 6. Verify it's gone
    const deleted = await engine.getEntry('blog', 'integration-test')
    expect(deleted).toBeNull()
  })

  it('lists entries correctly after create and delete', async () => {
    // Create multiple entries
    await engine.createEntry('blog', {
      title: 'First Post',
      slug: 'first-post',
      status: 'published',
      content: 'First content',
    })

    await engine.createEntry('blog', {
      title: 'Second Post',
      slug: 'second-post',
      status: 'draft',
      content: 'Second content',
    })

    // List all entries
    const all = await engine.listEntries('blog')
    expect(all).toHaveLength(2)

    // List only published
    const published = await engine.listEntries('blog', { status: 'published' })
    expect(published).toHaveLength(1)
    expect(published[0].slug).toBe('first-post')

    // Delete one and verify list updates
    await engine.deleteEntry('blog', 'first-post')
    const afterDelete = await engine.listEntries('blog')
    expect(afterDelete).toHaveLength(1)
    expect(afterDelete[0].slug).toBe('second-post')
  })
})

describe('Full Cycle Integration: Cache invalidation on write', () => {
  let tempDir: string
  let engine: MadoriContentEngine
  let cache: InMemoryContentCache

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'madori-integration-'))
    setupTempDir(tempDir)

    const config = createTestConfig(tempDir)
    const fsAdapter = new NodeFileSystemAdapter()
    const parser = new MarkdownYamlParser()
    cache = new InMemoryContentCache()
    const blueprintLoader = new BlueprintLoader(fsAdapter, parser, config.resourcesPath)
    const blueprintRegistry = new BlueprintRegistry(blueprintLoader)

    engine = new MadoriContentEngine(config, fsAdapter, parser, cache, blueprintRegistry)
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('invalidates cache when a new entry is created', async () => {
    // Seed an entry directly on disk
    const entryContent = `---
title: Existing Post
slug: existing-post
status: published
createdAt: "2024-01-01T00:00:00.000Z"
updatedAt: "2024-01-01T00:00:00.000Z"
---

Existing content
`
    fs.writeFileSync(
      path.join(tempDir, 'content/collections/blog/existing-post.md'),
      entryContent
    )

    // First read populates cache
    const firstList = await engine.listEntries('blog')
    expect(firstList).toHaveLength(1)
    expect(firstList[0].slug).toBe('existing-post')

    // Create a new entry (should invalidate the entries cache)
    await engine.createEntry('blog', {
      title: 'New Post',
      slug: 'new-post',
      status: 'published',
      content: 'New content',
    })

    // Read again — should include the new entry (cache was invalidated)
    const secondList = await engine.listEntries('blog')
    expect(secondList).toHaveLength(2)

    const slugs = secondList.map((e) => e.slug).sort()
    expect(slugs).toEqual(['existing-post', 'new-post'])
  })

  it('invalidates cache when an entry is updated', async () => {
    // Create an entry
    await engine.createEntry('blog', {
      title: 'Original Title',
      slug: 'cache-test',
      status: 'draft',
      content: 'Original',
    })

    // Read to populate cache
    const first = await engine.getEntry('blog', 'cache-test')
    expect(first!.title).toBe('Original Title')

    // Update the entry
    await engine.updateEntry('blog', 'cache-test', {
      title: 'Updated Title',
    })

    // Read again — should reflect update (cache was invalidated)
    const second = await engine.getEntry('blog', 'cache-test')
    expect(second!.title).toBe('Updated Title')
  })

  it('invalidates cache when an entry is deleted', async () => {
    // Create entries
    await engine.createEntry('blog', {
      title: 'Keep Me',
      slug: 'keep-me',
      status: 'published',
      content: 'Staying',
    })

    await engine.createEntry('blog', {
      title: 'Delete Me',
      slug: 'delete-me',
      status: 'published',
      content: 'Going away',
    })

    // Read to populate cache
    const before = await engine.listEntries('blog')
    expect(before).toHaveLength(2)

    // Delete one entry
    await engine.deleteEntry('blog', 'delete-me')

    // Read again — should only have one entry
    const after = await engine.listEntries('blog')
    expect(after).toHaveLength(1)
    expect(after[0].slug).toBe('keep-me')
  })
})

describe('Full Cycle Integration: File watcher cache invalidation', () => {
  let tempDir: string
  let engine: MadoriContentEngine
  let cache: InMemoryContentCache
  let watcher: ChokidarFileWatcher

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'madori-integration-'))
    setupTempDir(tempDir)

    const config = createTestConfig(tempDir)
    const fsAdapter = new NodeFileSystemAdapter()
    const parser = new MarkdownYamlParser()
    cache = new InMemoryContentCache()
    const blueprintLoader = new BlueprintLoader(fsAdapter, parser, config.resourcesPath)
    const blueprintRegistry = new BlueprintRegistry(blueprintLoader)

    engine = new MadoriContentEngine(config, fsAdapter, parser, cache, blueprintRegistry)

    watcher = new ChokidarFileWatcher({ cache, basePath: tempDir })
    watcher.start()
  })

  afterEach(() => {
    watcher.stop()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('invalidates cache when a file is modified externally', async () => {
    // Create an entry via the engine
    await engine.createEntry('blog', {
      title: 'Watched Post',
      slug: 'watched-post',
      status: 'published',
      content: 'Original content',
    })

    // Read to populate cache
    const first = await engine.getEntry('blog', 'watched-post')
    expect(first!.title).toBe('Watched Post')

    // Directly modify the file on disk (simulating external change)
    const filePath = path.join(tempDir, 'content/collections/blog/watched-post.md')
    const modifiedContent = `---
title: Externally Modified
slug: watched-post
status: published
createdAt: "2024-01-01T00:00:00.000Z"
updatedAt: "2024-01-02T00:00:00.000Z"
---

Modified by external tool
`
    fs.writeFileSync(filePath, modifiedContent)

    // Wait for watcher to detect the change and invalidate cache
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Read again — should get fresh data from disk
    const second = await engine.getEntry('blog', 'watched-post')
    expect(second!.title).toBe('Externally Modified')
    expect(second!.content).toBe('Modified by external tool')
  }, 5000) // Extended timeout for file watcher
})

describe('Full Cycle Integration: GraphQL resolver equivalence', () => {
  let tempDir: string
  let engine: MadoriContentEngine
  let cache: InMemoryContentCache
  let resolvers: Record<string, unknown>

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'madori-integration-'))
    setupTempDir(tempDir)

    const config = createTestConfig(tempDir)
    const fsAdapter = new NodeFileSystemAdapter()
    const parser = new MarkdownYamlParser()
    cache = new InMemoryContentCache()
    const blueprintLoader = new BlueprintLoader(fsAdapter, parser, config.resourcesPath)
    const blueprintRegistry = new BlueprintRegistry(blueprintLoader)

    engine = new MadoriContentEngine(config, fsAdapter, parser, cache, blueprintRegistry)

    // Build resolvers with the blog collection config
    resolvers = buildResolvers([config.collections.blog])
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('resolver returns same data as direct Content Engine query for single entry', async () => {
    // Create an entry via the engine
    await engine.createEntry('blog', {
      title: 'GraphQL Test',
      slug: 'graphql-test',
      status: 'published',
      content: '# GraphQL\n\nTest content.',
    })

    // Query directly via Content Engine
    const directEntry = await engine.getEntry('blog', 'graphql-test')
    expect(directEntry).not.toBeNull()

    // Query via resolver
    const context: GraphQLContext = {
      contentEngine: engine,
      blueprintRegistry: new BlueprintRegistry(
        new BlueprintLoader(
          new NodeFileSystemAdapter(),
          new MarkdownYamlParser(),
          path.join(tempDir, 'resources')
        )
      ),
    }

    const blogResolver = resolvers['blog'] as (
      parent: unknown,
      args: { slug: string },
      ctx: GraphQLContext
    ) => Promise<Record<string, unknown> | null>

    const resolverResult = await blogResolver(null, { slug: 'graphql-test' }, context)

    expect(resolverResult).not.toBeNull()
    expect(resolverResult!.title).toBe(directEntry!.title)
    expect(resolverResult!.slug).toBe(directEntry!.slug)
    expect(resolverResult!.status).toBe(directEntry!.status)
    expect(resolverResult!.content).toBe(directEntry!.content)
    expect(resolverResult!.createdAt).toBe(directEntry!.createdAt)
    expect(resolverResult!.updatedAt).toBe(directEntry!.updatedAt)
  })

  it('list resolver returns same entries as direct Content Engine list', async () => {
    // Create multiple entries
    await engine.createEntry('blog', {
      title: 'Post A',
      slug: 'post-a',
      status: 'published',
      content: 'Content A',
    })

    await engine.createEntry('blog', {
      title: 'Post B',
      slug: 'post-b',
      status: 'published',
      content: 'Content B',
    })

    // Query directly via Content Engine
    const directEntries = await engine.listEntries('blog')
    expect(directEntries).toHaveLength(2)

    // Query via list resolver
    const context: GraphQLContext = {
      contentEngine: engine,
      blueprintRegistry: new BlueprintRegistry(
        new BlueprintLoader(
          new NodeFileSystemAdapter(),
          new MarkdownYamlParser(),
          path.join(tempDir, 'resources')
        )
      ),
    }

    const blogsResolver = resolvers['blogs'] as (
      parent: unknown,
      args: { filter?: Record<string, unknown>; limit?: number; offset?: number; sort?: string },
      ctx: GraphQLContext
    ) => Promise<Record<string, unknown>[]>

    const resolverResults = await blogsResolver(null, {}, context)

    expect(resolverResults).toHaveLength(2)

    // Verify each resolver result matches the direct engine result
    for (const directEntry of directEntries) {
      const resolverEntry = resolverResults.find((r) => r.slug === directEntry.slug)
      expect(resolverEntry).toBeDefined()
      expect(resolverEntry!.title).toBe(directEntry.title)
      expect(resolverEntry!.status).toBe(directEntry.status)
      expect(resolverEntry!.content).toBe(directEntry.content)
    }
  })

  it('list resolver supports filtering and sorting like Content Engine', async () => {
    await engine.createEntry('blog', {
      title: 'Alpha',
      slug: 'alpha',
      status: 'published',
      content: 'A',
    })

    await engine.createEntry('blog', {
      title: 'Beta',
      slug: 'beta',
      status: 'draft',
      content: 'B',
    })

    await engine.createEntry('blog', {
      title: 'Gamma',
      slug: 'gamma',
      status: 'published',
      content: 'G',
    })

    const context: GraphQLContext = {
      contentEngine: engine,
      blueprintRegistry: new BlueprintRegistry(
        new BlueprintLoader(
          new NodeFileSystemAdapter(),
          new MarkdownYamlParser(),
          path.join(tempDir, 'resources')
        )
      ),
    }

    const blogsResolver = resolvers['blogs'] as (
      parent: unknown,
      args: { filter?: Record<string, unknown>; limit?: number; offset?: number; sort?: string },
      ctx: GraphQLContext
    ) => Promise<Record<string, unknown>[]>

    // Test limit
    const limited = await blogsResolver(null, { limit: 2 }, context)
    expect(limited).toHaveLength(2)

    // Test sort
    const sorted = await blogsResolver(null, { sort: 'title:desc' }, context)
    expect(sorted[0].title).toBe('Gamma')

    // Test offset
    const offset = await blogsResolver(null, { limit: 1, offset: 1 }, context)
    expect(offset).toHaveLength(1)
  })
})
