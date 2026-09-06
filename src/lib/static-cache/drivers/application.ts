import { globToRegex } from '../glob'
import type { StaticCacheDriver } from '../drivers'
import { readCacheGeneration, advanceCacheGeneration } from '../generation'

export class ApplicationCacheDriver implements StaticCacheDriver {
  private store: Map<string, string> = new Map()
  private generation: string | null = null

  constructor(private readonly storagePath?: string) {}

  private async syncGeneration(): Promise<void> {
    if (!this.storagePath) return
    const generation = await readCacheGeneration(this.storagePath)
    if (this.generation !== null && this.generation !== generation) this.store.clear()
    this.generation = generation
  }

  async get(key: string): Promise<string | null> {
    await this.syncGeneration()
    return this.store.get(key) ?? null
  }

  async set(key: string, html: string): Promise<void> {
    await this.syncGeneration()
    this.store.set(key, html)
  }

  async delete(key: string): Promise<void> {
    await this.syncGeneration()
    this.store.delete(key)
    await this.markInvalidated()
  }

  async deletePattern(pattern: string): Promise<string[]> {
    await this.syncGeneration()
    const deleted: string[] = []
    const regex = globToRegex(pattern)
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key)
        deleted.push(key)
      }
    }
    await this.markInvalidated()
    return deleted
  }

  async clear(): Promise<number> {
    await this.syncGeneration()
    const count = this.store.size
    this.store.clear()
    await this.markInvalidated()
    return count
  }

  async has(key: string): Promise<boolean> {
    await this.syncGeneration()
    return this.store.has(key)
  }

  /** Publish invalidation to other application runtimes sharing storagePath. */
  async markInvalidated(): Promise<void> {
    if (this.storagePath) this.generation = await advanceCacheGeneration(this.storagePath)
  }

  async getGeneration(): Promise<string> {
    await this.syncGeneration()
    return this.generation ?? ''
  }
}
