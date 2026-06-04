import fs from 'fs/promises'
import path from 'path'
import { globToRegex } from '../glob'
import type { StaticCacheDriver } from '../drivers'

export class FileCacheDriver implements StaticCacheDriver {
  constructor(private storagePath: string) {}

  private keyToFilePath(key: string): string {
    const segments = key.replace(/^\//, '').replace(/\/$/, '')
    return path.join(this.storagePath, segments || '_root', 'index.html')
  }

  private filePathToKey(filePath: string): string {
    const relative = path.relative(this.storagePath, path.dirname(filePath))
    if (relative === '_root') return '/'
    return '/' + relative.replace(/\\/g, '/')
  }

  private async walkDirectory(dir: string): Promise<string[]> {
    const results: string[] = []
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          results.push(...(await this.walkDirectory(fullPath)))
        } else if (entry.name === 'index.html') {
          results.push(fullPath)
        }
      }
    } catch {
      // Directory may not exist
    }
    return results
  }

  async get(key: string): Promise<string | null> {
    try {
      return await fs.readFile(this.keyToFilePath(key), 'utf-8')
    } catch {
      return null
    }
  }

  async set(key: string, html: string): Promise<void> {
    const filePath = this.keyToFilePath(key)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, html, 'utf-8')
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.keyToFilePath(key))
    } catch {
      // File may not exist
    }
  }

  async deletePattern(pattern: string): Promise<string[]> {
    const deleted: string[] = []
    const regex = globToRegex(pattern)
    const entries = await this.walkDirectory(this.storagePath)
    for (const entry of entries) {
      const key = this.filePathToKey(entry)
      if (regex.test(key)) {
        await fs.unlink(entry)
        deleted.push(key)
      }
    }
    return deleted
  }

  async clear(): Promise<number> {
    const entries = await this.walkDirectory(this.storagePath)
    for (const entry of entries) {
      await fs.unlink(entry)
    }
    return entries.length
  }

  async has(key: string): Promise<boolean> {
    try {
      await fs.access(this.keyToFilePath(key))
      return true
    } catch {
      return false
    }
  }
}
