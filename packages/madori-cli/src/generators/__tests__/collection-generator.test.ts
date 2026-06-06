import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import { parseFieldDefinitions, generateCollection } from '../collection-generator.js'

import type { ScaffoldCollectionOptions } from '../collection-generator.js'

// Mock fs/promises
vi.mock('fs/promises', () => ({
  access: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}))

const mockAccess = vi.mocked(fs.access)
const mockWriteFile = vi.mocked(fs.writeFile)
const mockMkdir = vi.mocked(fs.mkdir)

describe('parseFieldDefinitions', () => {
  it('parses a single field with handle and type', () => {
    const result = parseFieldDefinitions('title:text')
    expect(result).toEqual([
      { handle: 'title', type: 'text', display: 'Title', required: undefined },
    ])
  })

  it('parses multiple comma-separated fields', () => {
    const result = parseFieldDefinitions('title:text,body:tiptap,author:text')
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ handle: 'title', type: 'text', display: 'Title', required: undefined })
    expect(result[1]).toEqual({ handle: 'body', type: 'tiptap', display: 'Body', required: undefined })
    expect(result[2]).toEqual({ handle: 'author', type: 'text', display: 'Author', required: undefined })
  })

  it('parses the required modifier', () => {
    const result = parseFieldDefinitions('title:text:required')
    expect(result[0].required).toBe(true)
  })

  it('handles mixed required and optional fields', () => {
    const result = parseFieldDefinitions('title:text:required,body:tiptap,slug:text:required')
    expect(result[0].required).toBe(true)
    expect(result[1].required).toBeUndefined()
    expect(result[2].required).toBe(true)
  })

  it('defaults type to text when type is omitted after colon', () => {
    // "title:" splits into ['title', ''], the fallback is 'text'
    const result = parseFieldDefinitions('title')
    expect(result[0].type).toBe('text')
  })

  it('title-cases display from hyphenated handle', () => {
    const result = parseFieldDefinitions('hero-image:text')
    expect(result[0].display).toBe('Hero Image')
  })

  it('title-cases display from underscored handle', () => {
    const result = parseFieldDefinitions('created_at:date')
    expect(result[0].display).toBe('Created At')
  })

  it('returns empty array for empty string', () => {
    const result = parseFieldDefinitions('')
    expect(result).toEqual([])
  })

  it('returns empty array for whitespace-only string', () => {
    const result = parseFieldDefinitions('   ')
    expect(result).toEqual([])
  })
})

describe('generateCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: no files exist
    mockAccess.mockRejectedValue(new Error('ENOENT'))
    mockWriteFile.mockResolvedValue(undefined)
    mockMkdir.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws when handle is invalid', async () => {
    await expect(
      generateCollection({ handle: '123invalid' })
    ).rejects.toThrow()
  })

  it('throws when handle is a reserved name', async () => {
    await expect(
      generateCollection({ handle: 'admin' })
    ).rejects.toThrow('reserved')
  })

  it('throws when collection files already exist', async () => {
    mockAccess.mockResolvedValue(undefined) // files exist
    await expect(
      generateCollection({ handle: 'blog' })
    ).rejects.toThrow('already exists')
  })

  it('creates three files for a valid handle', async () => {
    const result = await generateCollection({ handle: 'blog-posts' })

    expect(result.files).toHaveLength(3)
    expect(result.files[0]).toContain('resources/collections/blog-posts.yaml')
    expect(result.files[1]).toContain('resources/blueprints/collections/blog-posts.yaml')
    expect(result.files[2]).toContain('content/collections/blog-posts/example.md')
  })

  it('generates collection with default route when none specified', async () => {
    await generateCollection({ handle: 'articles' })

    // Find the writeFile call for the collection YAML
    const collectionCall = mockWriteFile.mock.calls.find(
      (call) => (call[0] as string).includes('resources/collections/articles.yaml')
    )
    expect(collectionCall).toBeDefined()
    const content = collectionCall![1] as string
    expect(content).toContain('route: /articles/{slug}')
  })

  it('applies custom route from options', async () => {
    await generateCollection({ handle: 'articles', route: '/news/{slug}' })

    const collectionCall = mockWriteFile.mock.calls.find(
      (call) => (call[0] as string).includes('resources/collections/articles.yaml')
    )
    expect(collectionCall).toBeDefined()
    const content = collectionCall![1] as string
    expect(content).toContain('route: /news/{slug}')
  })

  it('generates blueprint with specified fields', async () => {
    await generateCollection({
      handle: 'posts',
      fields: [
        { handle: 'title', type: 'text', display: 'Title', required: true },
        { handle: 'body', type: 'tiptap', display: 'Body' },
      ],
    })

    const blueprintCall = mockWriteFile.mock.calls.find(
      (call) => (call[0] as string).includes('resources/blueprints/collections/posts.yaml')
    )
    expect(blueprintCall).toBeDefined()
    const content = blueprintCall![1] as string
    expect(content).toContain('handle: title')
    expect(content).toContain('type: text')
    expect(content).toContain('required: true')
    expect(content).toContain('handle: body')
    expect(content).toContain('type: tiptap')
  })

  it('generates example entry with correct frontmatter', async () => {
    await generateCollection({ handle: 'blog' })

    const entryCall = mockWriteFile.mock.calls.find(
      (call) => (call[0] as string).includes('content/collections/blog/example.md')
    )
    expect(entryCall).toBeDefined()
    const content = entryCall![1] as string
    expect(content).toContain('title: Example Blog')
    expect(content).toContain('slug: example')
    expect(content).toContain('status: draft')
    expect(content).toContain('createdAt:')
    expect(content).toContain('updatedAt:')
    expect(content).toContain('# Example Blog')
    expect(content).toContain('example entry for the blog collection')
  })

  it('title-cases handle with hyphens for display', async () => {
    await generateCollection({ handle: 'blog-posts' })

    const collectionCall = mockWriteFile.mock.calls.find(
      (call) => (call[0] as string).includes('resources/collections/blog-posts.yaml')
    )
    expect(collectionCall).toBeDefined()
    const content = collectionCall![1] as string
    expect(content).toContain('title: Blog Posts')
  })
})
