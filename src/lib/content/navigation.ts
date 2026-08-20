import * as path from 'path'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'
import type { ContentCache } from '@/lib/cache/store'
import type { Navigation, NavigationItem } from '@/lib/types'
import { serializeNavigation } from '@/lib/navigation/tree'
import { AtomicFileWriter } from '@/lib/fs/atomic-writer'
import { assertContentIdentifier } from './identifiers'
import type { ContentMutationReporter } from '@/lib/mutations'
import { noOpContentMutationReporter } from '@/lib/mutations'

export class NavigationOperations {
  private readonly atomicWriter: AtomicFileWriter

  constructor(
    private readonly fs: FileSystemAdapter,
    private readonly parser: ContentParser,
    private readonly cache: ContentCache,
    private readonly contentPath: string,
    private readonly mutations: ContentMutationReporter = noOpContentMutationReporter
  ) {
    this.atomicWriter = new AtomicFileWriter(fs)
  }

  private get navigationDir(): string {
    return path.join(this.contentPath, 'navigation')
  }

  private cacheKey(handle: string): string {
    return `navigation:${handle}`
  }

  async getNavigation(handle: string): Promise<Navigation | null> {
    assertContentIdentifier(handle, 'navigation handle')
    const cached = this.cache.get<Navigation>(this.cacheKey(handle))
    if (cached) return cached

    const filePath = path.join(this.navigationDir, `${handle}.yaml`)
    const fileExists = await this.fs.exists(filePath)
    if (!fileExists) return null

    const raw = await this.fs.readFile(filePath)
    const data = this.parser.parseYaml<{ items?: unknown[] }>(raw)

    const navigation: Navigation = {
      handle,
      items: Array.isArray(data.items) ? this.parseItems(data.items) : [],
    }

    this.cache.set(this.cacheKey(handle), navigation, [filePath])
    return navigation
  }

  async listNavigations(): Promise<Navigation[]> {
    const cached = this.cache.get<Navigation[]>('navigations:list')
    if (cached) return cached

    const dirExists = await this.fs.exists(this.navigationDir)
    if (!dirExists) return []

    const files = await this.fs.listFiles(this.navigationDir, '*.yaml')
    const navigations: Navigation[] = []

    for (const file of files) {
      const handle = path.basename(file, '.yaml')
      const nav = await this.getNavigation(handle)
      if (nav) navigations.push(nav)
    }

    this.cache.set('navigations:list', navigations, [this.navigationDir])
    return navigations
  }

  async saveNavigation(handle: string, items: NavigationItem[]): Promise<Navigation> {
    assertContentIdentifier(handle, 'navigation handle')
    const filePath = path.join(this.navigationDir, `${handle}.yaml`)
    const yaml = serializeNavigation(items)
    const result = await this.atomicWriter.writeFileAtomic(filePath, yaml)
    if (!result.success) throw result.error ?? new Error(`Could not save navigation: ${handle}`)

    // Invalidate cache
    this.cache.invalidate(this.cacheKey(handle))
    this.cache.invalidate('navigations:list')

    const navigation: Navigation = { handle, items }
    this.cache.set(this.cacheKey(handle), navigation, [filePath])
    this.mutations.report({ action: 'update', paths: [filePath], resource: { type: 'navigation', id: handle }, message: `Updated navigation ${handle}`, source: 'system', timestamp: Date.now() })
    return navigation
  }

  private parseItems(items: unknown[]): NavigationItem[] {
    return items.map((item) => this.parseItem(item))
  }

  private parseItem(item: unknown): NavigationItem {
    if (typeof item !== 'object' || item === null) {
      return {}
    }

    const { children, ...fields } = item as Record<string, unknown>
    const navItem: NavigationItem = { ...fields }

    if (Array.isArray(children)) {
      navItem.children = this.parseItems(children)
    }

    return navItem
  }
}
