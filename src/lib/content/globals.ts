import * as path from 'path'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'
import type { ContentCache } from '@/lib/cache/store'
import type { Global } from '@/lib/types'
import { NotFoundError } from '@/lib/errors'

export class GlobalOperations {
  constructor(
    private readonly fs: FileSystemAdapter,
    private readonly parser: ContentParser,
    private readonly cache: ContentCache,
    private readonly contentPath: string
  ) {}

  private get globalsDir(): string {
    return path.join(this.contentPath, 'globals')
  }

  private cacheKey(handle: string): string {
    return `global:${handle}`
  }

  async getGlobal(handle: string): Promise<Global | null> {
    const cached = this.cache.get<Global>(this.cacheKey(handle))
    if (cached) return cached

    const filePath = path.join(this.globalsDir, `${handle}.yaml`)
    const fileExists = await this.fs.exists(filePath)
    if (!fileExists) return null

    const raw = await this.fs.readFile(filePath)
    const data = this.parser.parseYaml<Record<string, unknown>>(raw)

    const global: Global = {
      handle,
      title: typeof data.title === 'string' ? data.title : undefined,
      data,
    }

    this.cache.set(this.cacheKey(handle), global, [filePath])
    return global
  }

  async listGlobals(): Promise<Global[]> {
    const cached = this.cache.get<Global[]>('globals:list')
    if (cached) return cached

    const dirExists = await this.fs.exists(this.globalsDir)
    if (!dirExists) return []

    const files = await this.fs.listFiles(this.globalsDir, '*.yaml')
    const globals: Global[] = []

    for (const file of files) {
      const handle = path.basename(file, '.yaml')
      const global = await this.getGlobal(handle)
      if (global) globals.push(global)
    }

    this.cache.set('globals:list', globals, [this.globalsDir])
    return globals
  }

  async updateGlobal(handle: string, data: Record<string, unknown>): Promise<Global> {
    const filePath = path.join(this.globalsDir, `${handle}.yaml`)

    const yaml = this.parser.serializeYaml(data)
    await this.fs.writeFile(filePath, yaml)

    // Invalidate cache
    this.cache.invalidate(this.cacheKey(handle))
    this.cache.invalidate('globals:list')

    const global: Global = {
      handle,
      title: typeof data.title === 'string' ? data.title : undefined,
      data,
    }

    this.cache.set(this.cacheKey(handle), global, [filePath])
    return global
  }
}
