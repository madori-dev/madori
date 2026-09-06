import fs from 'fs/promises'
import path from 'path'
import { randomBytes } from 'crypto'
import { globToRegex } from '../glob'
import type { StaticCacheDriver } from '../drivers'
import { readCacheGeneration, advanceCacheGeneration } from '../generation'

const SAFE_SEGMENT = /^[a-zA-Z0-9._~-]+$/
const QUERY_SEGMENT_PREFIX = '%3F'

function encodeSegment(segment: string): string {
  // These names belong to cache storage, so authored URL segments must escape them.
  if (segment === '_root') return '%5Froot'
  if (segment === 'index.html') return '%69ndex.html'
  return SAFE_SEGMENT.test(segment) ? segment : encodeURIComponent(segment)
}

function decodeSegment(segment: string): string {
  return segment.includes('%') ? decodeURIComponent(segment) : segment
}

export class FileCacheDriver implements StaticCacheDriver {
  constructor(private storagePath: string) {}

  private keyToFilePath(key: string): string {
    if (typeof key !== 'string' || !key.startsWith('/') || key.includes('\\') || key.includes('\0')) {
      throw new Error(`Invalid cache key: ${key}`)
    }
    const queryIndex = key.indexOf('?')
    const pathname = queryIndex < 0 ? key : key.slice(0, queryIndex)
    const query = queryIndex < 0 ? undefined : key.slice(queryIndex + 1)
    const trimmedPathname = pathname.replace(/^\//, '').replace(/\/$/, '')
    const rawSegments = trimmedPathname ? trimmedPathname.split('/') : []
    if (rawSegments.some((segment) => !segment || segment === '.' || segment === '..')) {
      throw new Error(`Invalid cache key: ${key}`)
    }
    const segments = rawSegments.map(encodeSegment)
    if (query !== undefined) segments.push(`${QUERY_SEGMENT_PREFIX}${encodeURIComponent(query)}`)
    const root = path.resolve(this.storagePath)
    const candidate = path.resolve(root, segments.join('/') || '_root', 'index.html')
    if (!candidate.startsWith(`${root}${path.sep}`)) throw new Error(`Invalid cache key: ${key}`)
    return candidate
  }

  private filePathToKey(filePath: string): string {
    const relative = path.relative(this.storagePath, path.dirname(filePath))
    if (relative === '_root') return '/'
    const segments = relative.split(path.sep)
    const querySegment = segments.at(-1)
    let query = ''
    if (querySegment?.startsWith(QUERY_SEGMENT_PREFIX)) {
      query = `?${decodeURIComponent(querySegment.slice(QUERY_SEGMENT_PREFIX.length))}`
      segments.pop()
    }
    const pathname = segments.length
      ? '/' + segments.map(decodeSegment).join('/')
      : '/'
    return pathname + query
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
    const tempPath = `${filePath}.tmp.${randomBytes(8).toString('hex')}`
    try {
      await fs.writeFile(tempPath, html, 'utf-8')
      await fs.rename(tempPath, filePath)
    } catch (error) {
      await fs.unlink(tempPath).catch(() => undefined)
      throw error
    }
  }

  async delete(key: string): Promise<void> {
    await this.markInvalidated()
    try {
      await fs.unlink(this.keyToFilePath(key))
    } catch {
      // File may not exist
    }
  }

  async deletePattern(pattern: string): Promise<string[]> {
    await this.markInvalidated()
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
    await this.markInvalidated()
    const entries = await this.walkDirectory(this.storagePath)
    for (const entry of entries) {
      await fs.unlink(entry)
    }
    return entries.length
  }

  async markInvalidated(): Promise<void> {
    await advanceCacheGeneration(this.storagePath)
  }

  async getGeneration(): Promise<string> {
    return readCacheGeneration(this.storagePath)
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
