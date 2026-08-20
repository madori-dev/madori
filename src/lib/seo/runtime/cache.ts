import type { SeoCacheDependencies, SeoCacheInvalidation } from './types'

interface CacheEntry<T> { value: Promise<T>; dependencies: Required<SeoCacheDependencies> }

/** Small dependency-indexed cache; invalidation is explicit and deterministic. */
export class SeoRuntimeCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>()

  getOrCreate<T>(key: string, dependencies: SeoCacheDependencies, factory: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key) as CacheEntry<T> | undefined
    if (existing) return existing.value
    const value = factory().catch(error => {
      this.entries.delete(key)
      throw error
    })
    this.entries.set(key, { value, dependencies: normalize(dependencies) })
    return value
  }

  invalidate(change: SeoCacheInvalidation = {}): number {
    if (!Object.keys(change).length) {
      const size = this.entries.size
      this.entries.clear()
      return size
    }
    let removed = 0
    for (const [key, entry] of this.entries) {
      if (intersects(entry.dependencies, change)) {
        this.entries.delete(key)
        removed += 1
      }
    }
    return removed
  }

  clear(): void { this.entries.clear() }
  get size(): number { return this.entries.size }
}

function normalize(value: SeoCacheDependencies): Required<SeoCacheDependencies> {
  return { sites: [...(value.sites ?? [])], sections: [...(value.sections ?? [])], records: [...(value.records ?? [])], assets: [...(value.assets ?? [])] }
}

function intersects(dependencies: Required<SeoCacheDependencies>, change: SeoCacheInvalidation): boolean {
  return (['sites', 'sections', 'records', 'assets'] as const).some(kind => {
    const affected = change[kind]
    return Boolean(affected?.some(value => value === '*' || dependencies[kind].some(dependency => dependency === '*' || dependency === value || (dependency.endsWith(':*') && value.startsWith(dependency.slice(0, -1))))))
  })
}
