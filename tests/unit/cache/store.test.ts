import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryContentCache } from '@/lib/cache/store'

describe('InMemoryContentCache', () => {
  let cache: InMemoryContentCache

  beforeEach(() => {
    cache = new InMemoryContentCache()
  })

  describe('get/set', () => {
    it('returns undefined for cache miss', () => {
      expect(cache.get('nonexistent')).toBeUndefined()
    })

    it('stores and retrieves a value', () => {
      cache.set('entry:blog:hello', { title: 'Hello' })
      expect(cache.get('entry:blog:hello')).toEqual({ title: 'Hello' })
    })

    it('stores values with correct types', () => {
      cache.set<string[]>('entries:blog', ['hello', 'world'])
      const result = cache.get<string[]>('entries:blog')
      expect(result).toEqual(['hello', 'world'])
    })

    it('overwrites existing values', () => {
      cache.set('global:site', { name: 'Old' })
      cache.set('global:site', { name: 'New' })
      expect(cache.get('global:site')).toEqual({ name: 'New' })
    })

    it('stores invalidatedBy file paths', () => {
      cache.set('entry:blog:hello', { title: 'Hello' }, [
        'content/collections/blog/hello-world.md',
      ])
      // Value is still retrievable
      expect(cache.get('entry:blog:hello')).toEqual({ title: 'Hello' })
    })
  })

  describe('invalidate', () => {
    it('removes a specific key', () => {
      cache.set('entry:blog:hello', { title: 'Hello' })
      cache.invalidate('entry:blog:hello')
      expect(cache.get('entry:blog:hello')).toBeUndefined()
    })

    it('does nothing for nonexistent key', () => {
      // Should not throw
      cache.invalidate('nonexistent')
    })
  })

  describe('invalidatePattern', () => {
    it('removes all keys matching a prefix pattern', () => {
      cache.set('entries:blog:hello-world', { title: 'Hello World' })
      cache.set('entries:blog:second-post', { title: 'Second Post' })
      cache.set('entries:pages:about', { title: 'About' })

      cache.invalidatePattern('entries:blog:*')

      expect(cache.get('entries:blog:hello-world')).toBeUndefined()
      expect(cache.get('entries:blog:second-post')).toBeUndefined()
      expect(cache.get('entries:pages:about')).toEqual({ title: 'About' })
    })

    it('removes keys matching a suffix pattern', () => {
      cache.set('blueprint:collections:blog', { handle: 'blog' })
      cache.set('blueprint:taxonomies:tags', { handle: 'tags' })
      cache.set('entry:blog:post', { title: 'Post' })

      cache.invalidatePattern('blueprint:*')

      expect(cache.get('blueprint:collections:blog')).toBeUndefined()
      expect(cache.get('blueprint:taxonomies:tags')).toBeUndefined()
      expect(cache.get('entry:blog:post')).toEqual({ title: 'Post' })
    })

    it('handles pattern with no wildcard (exact match)', () => {
      cache.set('global:site', { name: 'Site' })
      cache.set('global:footer', { name: 'Footer' })

      cache.invalidatePattern('global:site')

      expect(cache.get('global:site')).toBeUndefined()
      expect(cache.get('global:footer')).toEqual({ name: 'Footer' })
    })

    it('handles wildcard-only pattern (clears all)', () => {
      cache.set('entry:blog:hello', { title: 'Hello' })
      cache.set('global:site', { name: 'Site' })

      cache.invalidatePattern('*')

      expect(cache.get('entry:blog:hello')).toBeUndefined()
      expect(cache.get('global:site')).toBeUndefined()
    })
  })

  describe('invalidateByFilePath', () => {
    it('removes entries associated with a file path', () => {
      cache.set('entry:blog:hello', { title: 'Hello' }, [
        'content/collections/blog/hello-world.md',
      ])
      cache.set('entries:blog', [{ title: 'Hello' }], [
        'content/collections/blog/hello-world.md',
      ])
      cache.set('entry:blog:other', { title: 'Other' }, [
        'content/collections/blog/other.md',
      ])

      cache.invalidateByFilePath('content/collections/blog/hello-world.md')

      expect(cache.get('entry:blog:hello')).toBeUndefined()
      expect(cache.get('entries:blog')).toBeUndefined()
      expect(cache.get('entry:blog:other')).toEqual({ title: 'Other' })
    })

    it('does nothing when no entries match the file path', () => {
      cache.set('entry:blog:hello', { title: 'Hello' }, [
        'content/collections/blog/hello-world.md',
      ])

      cache.invalidateByFilePath('content/collections/blog/nonexistent.md')

      expect(cache.get('entry:blog:hello')).toEqual({ title: 'Hello' })
    })

    it('handles entries with no invalidatedBy paths', () => {
      cache.set('global:site', { name: 'Site' })

      cache.invalidateByFilePath('content/globals/site.yaml')

      expect(cache.get('global:site')).toEqual({ name: 'Site' })
    })
  })

  describe('clear', () => {
    it('removes all entries', () => {
      cache.set('entry:blog:hello', { title: 'Hello' })
      cache.set('global:site', { name: 'Site' })
      cache.set('navigation:main', { items: [] })

      cache.clear()

      expect(cache.get('entry:blog:hello')).toBeUndefined()
      expect(cache.get('global:site')).toBeUndefined()
      expect(cache.get('navigation:main')).toBeUndefined()
    })
  })
})
