/**
 * In-memory Content Cache
 *
 * Provides fast content lookups with pattern-based invalidation
 * and file-path-based cache busting for the file watcher integration.
 */

export interface CacheEntry<T> {
  data: T
  cachedAt: number
  invalidatedBy: string[] // file paths that would invalidate this entry
}

export interface ContentCache {
  get<T>(key: string): T | undefined
  set<T>(key: string, value: T, invalidatedBy?: string[]): void
  invalidate(key: string): void
  invalidatePattern(pattern: string): void
  invalidateByFilePath(filePath: string): void
  clear(): void
}

export class InMemoryContentCache implements ContentCache {
  private store: Map<string, CacheEntry<unknown>> = new Map()

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    return entry.data as T
  }

  set<T>(key: string, value: T, invalidatedBy: string[] = []): void {
    const entry: CacheEntry<T> = {
      data: value,
      cachedAt: Date.now(),
      invalidatedBy,
    }
    this.store.set(key, entry as CacheEntry<unknown>)
  }

  invalidate(key: string): void {
    this.store.delete(key)
  }

  invalidatePattern(pattern: string): void {
    // Support glob-like patterns with * wildcard
    // Split on * and check if key starts with the prefix
    const parts = pattern.split('*')
    const prefix = parts[0]
    const suffix = parts.length > 1 ? parts[parts.length - 1] : ''

    for (const key of this.store.keys()) {
      if (key.startsWith(prefix) && key.endsWith(suffix)) {
        this.store.delete(key)
      }
    }
  }

  invalidateByFilePath(filePath: string): void {
    for (const [key, entry] of this.store.entries()) {
      if (entry.invalidatedBy.includes(filePath)) {
        this.store.delete(key)
      }
    }
  }

  clear(): void {
    this.store.clear()
  }
}
