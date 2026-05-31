import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {
  FileConfigWriter,
  replaceCollectionEntry,
  findClosingBrace,
  serializeToTsObject,
} from '@/lib/config/writer'
import type { CollectionConfig } from '@/lib/config/schema'

describe('FileConfigWriter', () => {
  let tmpDir: string
  let configPath: string

  const sampleConfig = `import type { MadoriConfigInput } from './src/lib/config/schema'

const config: MadoriConfigInput = {
  contentPath: './content',
  resourcesPath: './resources',
  usersPath: './users',
  assetsPath: './public/assets',

  cp: {
    enabled: true,
    path: '/cp',
  },

  graphql: {
    enabled: true,
    path: '/api/graphql',
    introspection: process.env.NODE_ENV !== 'production',
  },

  collections: {
    blog: {
      title: 'Blog',
      handle: 'blog',
      route: '/blog/{slug}',
      blueprint: 'blog',
      defaultStatus: 'draft',
    },
  },

  taxonomies: {},
  globals: {},
  navigations: [],
}

export default config
`

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-writer-test-'))
    configPath = path.join(tmpDir, 'madori.config.ts')
    await fs.writeFile(configPath, sampleConfig, 'utf-8')
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('readCollectionConfig', () => {
    it('returns collection config for existing handle', async () => {
      const writer = new FileConfigWriter(configPath)
      const result = await writer.readCollectionConfig('blog')
      expect(result).not.toBeNull()
      expect(result!.title).toBe('Blog')
      expect(result!.handle).toBe('blog')
      expect(result!.route).toBe('/blog/{slug}')
      expect(result!.blueprint).toBe('blog')
      expect(result!.defaultStatus).toBe('draft')
    })

    it('returns null for non-existent handle', async () => {
      const writer = new FileConfigWriter(configPath)
      const result = await writer.readCollectionConfig('nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('writeCollectionConfig', () => {
    it('updates an existing collection entry', async () => {
      const writer = new FileConfigWriter(configPath)
      const updatedConfig: CollectionConfig = {
        title: 'My Blog',
        handle: 'blog',
        route: '/posts/{slug}',
        blueprint: 'blog',
        defaultStatus: 'published',
        sortable: true,
        sortDirection: 'desc',
      }

      await writer.writeCollectionConfig('blog', updatedConfig)

      const content = await fs.readFile(configPath, 'utf-8')
      expect(content).toContain("title: 'My Blog'")
      expect(content).toContain("route: '/posts/{slug}'")
      expect(content).toContain("defaultStatus: 'published'")
      expect(content).toContain('sortable: true')
      expect(content).toContain("sortDirection: 'desc'")
    })

    it('throws error if file is not writable', async () => {
      const nonWritablePath = path.join(tmpDir, 'readonly.config.ts')
      await fs.writeFile(nonWritablePath, sampleConfig, 'utf-8')
      await fs.chmod(nonWritablePath, 0o444)

      const writer = new FileConfigWriter(nonWritablePath)
      await expect(
        writer.writeCollectionConfig('blog', {
          title: 'Blog',
          handle: 'blog',
          blueprint: 'blog',
        })
      ).rejects.toThrow(/Cannot write to config file/)
    })

    it('preserves other parts of the config file', async () => {
      const writer = new FileConfigWriter(configPath)
      await writer.writeCollectionConfig('blog', {
        title: 'Updated Blog',
        handle: 'blog',
        blueprint: 'blog',
      })

      const content = await fs.readFile(configPath, 'utf-8')
      expect(content).toContain("contentPath: './content'")
      expect(content).toContain("resourcesPath: './resources'")
      expect(content).toContain('taxonomies: {}')
      expect(content).toContain('globals: {}')
    })
  })

  describe('writeCollectionConfig with multiple collections', () => {
    const multiCollectionConfig = `import type { MadoriConfigInput } from './src/lib/config/schema'

const config: MadoriConfigInput = {
  contentPath: './content',
  resourcesPath: './resources',
  usersPath: './users',
  assetsPath: './public/assets',

  collections: {
    blog: {
      title: 'Blog',
      handle: 'blog',
      route: '/blog/{slug}',
      blueprint: 'blog',
      defaultStatus: 'draft',
    },
    pages: {
      title: 'Pages',
      handle: 'pages',
      route: '/{slug}',
      blueprint: 'page',
    },
  },

  taxonomies: {},
  globals: {},
  navigations: [],
}

export default config
`

    it('updates only the target collection, leaving others unchanged', async () => {
      await fs.writeFile(configPath, multiCollectionConfig, 'utf-8')
      const writer = new FileConfigWriter(configPath)

      await writer.writeCollectionConfig('blog', {
        title: 'Updated Blog',
        handle: 'blog',
        route: '/articles/{slug}',
        blueprint: 'article',
      })

      const content = await fs.readFile(configPath, 'utf-8')
      // Updated collection
      expect(content).toContain("title: 'Updated Blog'")
      expect(content).toContain("route: '/articles/{slug}'")
      // Other collection preserved
      expect(content).toContain("title: 'Pages'")
      expect(content).toContain("route: '/{slug}'")
      expect(content).toContain("blueprint: 'page'")
    })
  })
})

describe('replaceCollectionEntry', () => {
  it('replaces the collection entry in file content', () => {
    const content = `collections: {
    blog: {
      title: 'Blog',
      handle: 'blog',
      blueprint: 'blog',
    },
  }`

    const result = replaceCollectionEntry(content, 'blog', {
      title: 'Updated',
      handle: 'blog',
      blueprint: 'updated',
    })

    expect(result).toContain("title: 'Updated'")
    expect(result).toContain("blueprint: 'updated'")
  })

  it('throws if collections block not found', () => {
    const content = `const config = { other: {} }`
    expect(() =>
      replaceCollectionEntry(content, 'blog', {
        title: 'Blog',
        handle: 'blog',
        blueprint: 'blog',
      })
    ).toThrow(/Could not find "collections" block/)
  })

  it('throws if handle not found in collections', () => {
    const content = `collections: {
    blog: { title: 'Blog', handle: 'blog', blueprint: 'blog' },
  }`
    expect(() =>
      replaceCollectionEntry(content, 'nonexistent', {
        title: 'X',
        handle: 'nonexistent',
        blueprint: 'x',
      })
    ).toThrow(/Could not find collection "nonexistent"/)
  })
})

describe('findClosingBrace', () => {
  it('finds matching closing brace', () => {
    const content = '{ a: { b: 1 } }'
    // String is 15 chars (indices 0-14), closing brace at index 14
    expect(findClosingBrace(content, 0)).toBe(14)
  })

  it('handles nested braces', () => {
    const content = '{ a: { b: { c: 1 } } }'
    // Outer closing brace at index 21, inner at index 19
    expect(findClosingBrace(content, 0)).toBe(21)
    expect(findClosingBrace(content, 5)).toBe(19)
  })

  it('ignores braces in strings', () => {
    const content = "{ a: '{nested}' }"
    // Closing brace at index 16
    expect(findClosingBrace(content, 0)).toBe(16)
  })

  it('returns -1 if no opening brace at startIndex', () => {
    expect(findClosingBrace('abc', 0)).toBe(-1)
  })

  it('returns -1 if no matching brace found', () => {
    expect(findClosingBrace('{ unclosed', 0)).toBe(-1)
  })
})

describe('serializeToTsObject', () => {
  it('serializes simple config', () => {
    const config: CollectionConfig = {
      title: 'Blog',
      handle: 'blog',
      blueprint: 'blog',
    }
    const result = serializeToTsObject(config, '      ')
    expect(result).toContain("title: 'Blog'")
    expect(result).toContain("handle: 'blog'")
    expect(result).toContain("blueprint: 'blog'")
  })

  it('serializes arrays', () => {
    const config: CollectionConfig = {
      title: 'Blog',
      handle: 'blog',
      blueprint: 'blog',
      taxonomies: ['tags', 'categories'],
    }
    const result = serializeToTsObject(config, '      ')
    expect(result).toContain("taxonomies: ['tags', 'categories']")
  })

  it('serializes nested objects', () => {
    const config: CollectionConfig = {
      title: 'Blog',
      handle: 'blog',
      blueprint: 'blog',
      redirects: { create: '/blog', '404': '/not-found' },
    }
    const result = serializeToTsObject(config, '      ')
    expect(result).toContain("create: '/blog'")
    expect(result).toContain("'404': '/not-found'")
  })

  it('omits undefined values', () => {
    const config: CollectionConfig = {
      title: 'Blog',
      handle: 'blog',
      blueprint: 'blog',
      icon: undefined,
    }
    const result = serializeToTsObject(config, '      ')
    expect(result).not.toContain('icon')
  })

  it('serializes boolean values', () => {
    const config: CollectionConfig = {
      title: 'Blog',
      handle: 'blog',
      blueprint: 'blog',
      sortable: true,
      dated: false,
    }
    const result = serializeToTsObject(config, '      ')
    expect(result).toContain('sortable: true')
    expect(result).toContain('dated: false')
  })
})
