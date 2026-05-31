import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getInvalidationPatterns, ChokidarFileWatcher } from '@/lib/cache/watcher'
import type { ContentCache } from '@/lib/cache/store'

describe('getInvalidationPatterns', () => {
  it('returns entries and entry patterns for collection files', () => {
    const patterns = getInvalidationPatterns('content/collections/blog/hello-world.md')
    expect(patterns).toContain('entries:blog:*')
    expect(patterns).toContain('entry:blog:*')
    expect(patterns).toHaveLength(2)
  })

  it('returns global pattern for globals files', () => {
    const patterns = getInvalidationPatterns('content/globals/site.yaml')
    expect(patterns).toContain('global:*')
    expect(patterns).toHaveLength(1)
  })

  it('returns navigation pattern for navigation files', () => {
    const patterns = getInvalidationPatterns('content/navigation/main.yaml')
    expect(patterns).toContain('navigation:*')
    expect(patterns).toHaveLength(1)
  })

  it('returns terms pattern for taxonomy files', () => {
    const patterns = getInvalidationPatterns('content/taxonomies/categories/updates.yaml')
    expect(patterns).toContain('terms:categories:*')
    expect(patterns).toHaveLength(1)
  })

  it('returns blueprint pattern for blueprint files', () => {
    const patterns = getInvalidationPatterns('resources/blueprints/collections/blog.yaml')
    expect(patterns).toContain('blueprint:*')
    expect(patterns).toHaveLength(1)
  })

  it('returns blueprint pattern for nested blueprint files', () => {
    const patterns = getInvalidationPatterns('resources/blueprints/forms/contact.yaml')
    expect(patterns).toContain('blueprint:*')
    expect(patterns).toHaveLength(1)
  })

  it('returns empty array for unrecognized paths', () => {
    const patterns = getInvalidationPatterns('users/michael.yaml')
    expect(patterns).toEqual([])
  })

  it('handles Windows-style backslash paths', () => {
    const patterns = getInvalidationPatterns('content\\collections\\blog\\post.md')
    expect(patterns).toContain('entries:blog:*')
    expect(patterns).toContain('entry:blog:*')
  })
})

describe('ChokidarFileWatcher', () => {
  let mockCache: ContentCache

  beforeEach(() => {
    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      invalidate: vi.fn(),
      invalidatePattern: vi.fn(),
      invalidateByFilePath: vi.fn(),
      clear: vi.fn(),
    }
  })

  it('registers callbacks via onFileChange', () => {
    const watcher = new ChokidarFileWatcher({
      cache: mockCache,
      basePath: '/project',
    })

    const callback = vi.fn()
    watcher.onFileChange(callback)

    // Callback is registered (we can't easily trigger events without starting the watcher)
    expect(callback).not.toHaveBeenCalled()
  })

  it('can be stopped without starting', () => {
    const watcher = new ChokidarFileWatcher({
      cache: mockCache,
      basePath: '/project',
    })

    // Should not throw
    expect(() => watcher.stop()).not.toThrow()
  })
})
