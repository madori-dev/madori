import * as path from 'path'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'
import type { ContentCache } from '@/lib/cache/store'
import type { Navigation, NavigationItem } from '@/lib/types'

export class NavigationOperations {
  constructor(
    private readonly fs: FileSystemAdapter,
    private readonly parser: ContentParser,
    private readonly cache: ContentCache,
    private readonly contentPath: string
  ) {}

  private get navigationDir(): string {
    return path.join(this.contentPath, 'navigation')
  }

  private cacheKey(handle: string): string {
    return `navigation:${handle}`
  }

  async getNavigation(handle: string): Promise<Navigation | null> {
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

  private parseItems(items: unknown[]): NavigationItem[] {
    return items.map((item) => this.parseItem(item))
  }

  private parseItem(item: unknown): NavigationItem {
    if (typeof item !== 'object' || item === null) {
      return { label: '' }
    }

    const obj = item as Record<string, unknown>

    const navItem: NavigationItem = {
      label: typeof obj.label === 'string' ? obj.label : '',
    }

    if (typeof obj.url === 'string') navItem.url = obj.url
    if (typeof obj.entry === 'string') navItem.entry = obj.entry
    if (typeof obj.external === 'boolean') navItem.external = obj.external

    if (Array.isArray(obj.children)) {
      navItem.children = this.parseItems(obj.children)
    }

    return navItem
  }
}
