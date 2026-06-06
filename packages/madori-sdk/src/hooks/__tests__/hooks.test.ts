import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock react's cache function
vi.mock('react', () => ({
  cache: vi.fn((fn: unknown) => fn),
  useState: undefined,
  useEffect: vi.fn(),
}))

// Mock next/cache
vi.mock('next/cache', () => ({
  unstable_cache: vi.fn((fn: unknown, _keys?: string[], _options?: unknown) => fn),
}))

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import type { TypedMadoriClient } from '../../index.js'

describe('Server Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('cachedGetEntry', () => {
    it('wraps client.getEntry with React cache() for request deduplication', async () => {
      // Dynamic import to get the module with mocks in place
      const { cachedGetEntry } = await import('../server.js')

      const mockClient = {
        getEntry: vi.fn().mockResolvedValue({ title: 'Test' }),
        listEntries: vi.fn(),
        getGlobal: vi.fn(),
        listCollections: vi.fn(),
        getTaxonomy: vi.fn(),
        listTerms: vi.fn(),
      } as unknown as TypedMadoriClient<{ blog: { title: string } }>

      const cachedFn = cachedGetEntry(mockClient)

      // Verify cache() from react was called
      expect(cache).toHaveBeenCalledTimes(1)
      expect(cache).toHaveBeenCalledWith(expect.any(Function))

      // Since our mock returns the function as-is, calling the cached fn
      // should invoke the underlying client method
      await cachedFn('blog', 'hello')
      expect(mockClient.getEntry).toHaveBeenCalledWith('blog', 'hello')
    })
  })

  describe('cachedListEntries', () => {
    it('wraps client.listEntries with React cache() for request deduplication', async () => {
      const { cachedListEntries } = await import('../server.js')

      const mockClient = {
        getEntry: vi.fn(),
        listEntries: vi.fn().mockResolvedValue([{ title: 'Test' }]),
        getGlobal: vi.fn(),
        listCollections: vi.fn(),
        getTaxonomy: vi.fn(),
        listTerms: vi.fn(),
      } as unknown as TypedMadoriClient<{ blog: { title: string } }>

      const cachedFn = cachedListEntries(mockClient)

      expect(cache).toHaveBeenCalled()

      await cachedFn('blog', { limit: 10 })
      expect(mockClient.listEntries).toHaveBeenCalledWith('blog', { limit: 10 })
    })
  })

  describe('taggedGetEntry', () => {
    it('uses unstable_cache with correct collection-based cache tags', async () => {
      const { taggedGetEntry } = await import('../server.js')

      const mockClient = {
        getEntry: vi.fn().mockResolvedValue({ title: 'Test' }),
        listEntries: vi.fn(),
        getGlobal: vi.fn(),
        listCollections: vi.fn(),
        getTaxonomy: vi.fn(),
        listTerms: vi.fn(),
      } as unknown as TypedMadoriClient<{ blog: { title: string } }>

      const taggedFn = taggedGetEntry(mockClient)
      await taggedFn('blog', 'hello-world')

      // Verify unstable_cache was called with the correct tag format
      expect(unstable_cache).toHaveBeenCalledWith(
        expect.any(Function),
        ['madori:blog:hello-world'],
        { tags: ['madori:collection:blog'] }
      )
    })

    it('applies different tags per collection handle', async () => {
      const { taggedGetEntry } = await import('../server.js')

      const mockClient = {
        getEntry: vi.fn().mockResolvedValue(null),
        listEntries: vi.fn(),
        getGlobal: vi.fn(),
        listCollections: vi.fn(),
        getTaxonomy: vi.fn(),
        listTerms: vi.fn(),
      } as unknown as TypedMadoriClient<{ docs: unknown; pages: unknown }>

      const taggedFn = taggedGetEntry(mockClient)

      await taggedFn('docs', 'getting-started')
      expect(unstable_cache).toHaveBeenCalledWith(
        expect.any(Function),
        ['madori:docs:getting-started'],
        { tags: ['madori:collection:docs'] }
      )

      vi.mocked(unstable_cache).mockClear()

      await taggedFn('pages', 'home')
      expect(unstable_cache).toHaveBeenCalledWith(
        expect.any(Function),
        ['madori:pages:home'],
        { tags: ['madori:collection:pages'] }
      )
    })
  })

  describe('taggedListEntries', () => {
    it('uses unstable_cache with correct collection-based cache tags', async () => {
      const { taggedListEntries } = await import('../server.js')

      const mockClient = {
        getEntry: vi.fn(),
        listEntries: vi.fn().mockResolvedValue([]),
        getGlobal: vi.fn(),
        listCollections: vi.fn(),
        getTaxonomy: vi.fn(),
        listTerms: vi.fn(),
      } as unknown as TypedMadoriClient<{ blog: { title: string } }>

      const taggedFn = taggedListEntries(mockClient)
      await taggedFn('blog', { limit: 5 })

      expect(unstable_cache).toHaveBeenCalledWith(
        expect.any(Function),
        [expect.stringContaining('madori:blog:list:')],
        { tags: ['madori:collection:blog'] }
      )
    })
  })
})

describe('Client Hooks', () => {
  describe('useMadoriEntry', () => {
    it('throws when used outside React component tree (useState not available)', async () => {
      // The mock above sets useState to undefined, simulating non-React environment
      const { useMadoriEntry } = await import('../client.js')

      expect(() => useMadoriEntry('blog', 'hello')).toThrow(
        'useMadoriEntry must be used within a React component'
      )
    })
  })

  describe('useMadoriEntries', () => {
    it('throws when used outside React component tree (useState not available)', async () => {
      const { useMadoriEntries } = await import('../client.js')

      expect(() => useMadoriEntries('blog')).toThrow(
        'useMadoriEntries must be used within a React component'
      )
    })
  })
})
