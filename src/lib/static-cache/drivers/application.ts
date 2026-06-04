import { globToRegex } from '../glob'
import type { StaticCacheDriver } from '../drivers'

export class ApplicationCacheDriver implements StaticCacheDriver {
  private store: Map<string, string> = new Map()

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null
  }

  async set(key: string, html: string): Promise<void> {
    this.store.set(key, html)
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }

  async deletePattern(pattern: string): Promise<string[]> {
    const deleted: string[] = []
    const regex = globToRegex(pattern)
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key)
        deleted.push(key)
      }
    }
    return deleted
  }

  async clear(): Promise<number> {
    const count = this.store.size
    this.store.clear()
    return count
  }

  async has(key: string): Promise<boolean> {
    return this.store.has(key)
  }
}
