import * as path from 'path'
import type { MadoriConfig, CollectionConfig } from '@/lib/config/schema'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'
import type { ContentCache } from '@/lib/cache/store'
import type { BlueprintRegistry } from '@/lib/blueprints/registry'
import { AtomicFileWriter } from '@/lib/fs/atomic-writer'
import { NotFoundError, ValidationError, ConflictError } from '@/lib/errors'
import { computeContentHash, verifyContentHash } from '@/lib/content/concurrency'
import { TaxonomyOperations } from './taxonomies'
import type {
  Entry,
  Collection,
  Taxonomy,
  Term,
  Global,
  Navigation,
  Asset,
  Form,
  FormSubmission,
  ListOptions,
} from '@/lib/types'

export interface EntryInput {
  title: string
  slug: string
  status?: 'published' | 'draft'
  author?: string
  content?: string
  data?: Record<string, unknown>
}

export interface ContentEngine {
  // Collections
  getCollection(handle: string): Promise<Collection | null>
  listCollections(): Promise<Collection[]>

  // Entries
  getEntry(collection: string, slug: string): Promise<Entry | null>
  listEntries(collection: string, options?: ListOptions): Promise<Entry[]>
  createEntry(collection: string, data: EntryInput): Promise<Entry>
  updateEntry(collection: string, slug: string, data: Partial<EntryInput>, contentHash?: string): Promise<Entry>
  deleteEntry(collection: string, slug: string): Promise<void>

  // Taxonomies
  getTaxonomy(handle: string): Promise<Taxonomy | null>
  listTaxonomies(): Promise<Taxonomy[]>
  getTerm(taxonomy: string, slug: string): Promise<Term | null>
  listTerms(taxonomy: string): Promise<Term[]>

  // Globals
  getGlobal(handle: string): Promise<Global | null>
  listGlobals(): Promise<Global[]>
  updateGlobal(handle: string, data: Record<string, unknown>): Promise<Global>

  // Navigation
  getNavigation(handle: string): Promise<Navigation | null>
  listNavigations(): Promise<Navigation[]>

  // Assets
  getAsset(path: string): Promise<Asset | null>
  listAssets(directory?: string): Promise<Asset[]>
  uploadAsset(file: File, directory?: string): Promise<Asset>
  deleteAsset(path: string): Promise<void>

  // Forms
  getForm(handle: string): Promise<Form | null>
  listForms(): Promise<Form[]>
  submitForm(handle: string, data: Record<string, unknown>): Promise<FormSubmission | null>
}

export class MadoriContentEngine implements ContentEngine {
  private readonly taxonomyOps: TaxonomyOperations
  private readonly atomicWriter: AtomicFileWriter
  private collectionsCache: Map<string, CollectionConfig> | null = null

  /** Invalidate the in-memory collections cache (call after create/delete). */
  invalidateCollectionsCache(): void {
    this.collectionsCache = null
    this.cache.clear()
  }

  constructor(
    private readonly config: MadoriConfig,
    private readonly fs: FileSystemAdapter,
    private readonly parser: ContentParser,
    private readonly cache: ContentCache,
    private readonly blueprintRegistry: BlueprintRegistry
  ) {
    this.taxonomyOps = new TaxonomyOperations(config, fs, parser, cache)
    this.atomicWriter = new AtomicFileWriter(fs)
  }

  /**
   * Startup routine: detect orphaned temporary files from interrupted writes
   * and log a warning for each one found.
   */
  async init(): Promise<void> {
    const contentDir = path.join(this.config.contentPath, 'collections')
    const dirExists = await this.fs.exists(contentDir)
    if (!dirExists) return

    const orphans = await this.atomicWriter.detectOrphans(contentDir)
    for (const orphanPath of orphans) {
      console.warn(`[madori] Orphaned temporary file detected: ${orphanPath}`)
    }
  }

  /**
   * Discover collections from resources/collections/ definition files.
   * Each definition file represents a collection that references a blueprint.
   */
  private async getCollectionConfigs(): Promise<Map<string, CollectionConfig>> {
    if (this.collectionsCache) return this.collectionsCache

    const configs = new Map<string, CollectionConfig>()

    // Load collection definitions from resources/collections/
    const collectionsDir = path.join(this.config.resourcesPath, 'collections')
    const dirExists = await this.fs.exists(collectionsDir)

    if (dirExists) {
      const files = await this.fs.listFiles(collectionsDir, '*.yaml')
      for (const file of files) {
        const filePath = path.join(collectionsDir, file)
        const content = await this.fs.readFile(filePath)
        const parsed = this.parser.parseYaml<Record<string, unknown>>(content)
        if (parsed && typeof parsed === 'object') {
          const data = parsed
          const handle = path.basename(file, path.extname(file))
          configs.set(handle, {
            title: (data.title as string) || handle.charAt(0).toUpperCase() + handle.slice(1),
            handle,
            blueprint: (data.blueprint as string) || handle,
            route: data.route as string | undefined,
            sortable: data.sortable as boolean | undefined,
            dated: data.dated as boolean | undefined,
            defaultStatus: data.defaultStatus as 'published' | 'draft' | undefined,
            icon: data.icon as string | undefined,
            sortDirection: data.sortDirection as 'asc' | 'desc' | undefined,
            template: data.template as string | undefined,
            layout: data.layout as string | undefined,
            taxonomies: data.taxonomies as string[] | undefined,
          })
        }
      }
    }

    this.collectionsCache = configs
    return configs
  }

  private async getCollectionConfig(handle: string): Promise<CollectionConfig | null> {
    const configs = await this.getCollectionConfigs()
    return configs.get(handle) ?? null
  }

  // ─── Collections ───────────────────────────────────────────────────────────

  async getCollection(handle: string): Promise<Collection | null> {
    const cacheKey = `collection:${handle}`
    const cached = this.cache.get<Collection>(cacheKey)
    if (cached) return cached

    const collectionConfig = await this.getCollectionConfig(handle)
    if (!collectionConfig) return null

    const collection: Collection = {
      title: collectionConfig.title,
      handle: collectionConfig.handle,
      route: collectionConfig.route,
      blueprint: collectionConfig.blueprint,
      sortable: collectionConfig.sortable,
      dated: collectionConfig.dated,
      defaultStatus: collectionConfig.defaultStatus,
    }

    this.cache.set(cacheKey, collection)
    return collection
  }

  async listCollections(): Promise<Collection[]> {
    const cacheKey = 'collections:all'
    const cached = this.cache.get<Collection[]>(cacheKey)
    if (cached) return cached

    const configs = await this.getCollectionConfigs()
    const collections: Collection[] = Array.from(configs.values()).map((c) => ({
      title: c.title,
      handle: c.handle,
      route: c.route,
      blueprint: c.blueprint,
      sortable: c.sortable,
      dated: c.dated,
      defaultStatus: c.defaultStatus,
    }))

    this.cache.set(cacheKey, collections)
    return collections
  }

  // ─── Entries ───────────────────────────────────────────────────────────────

  async getEntry(collection: string, slug: string): Promise<Entry | null> {
    const collectionConfig = await this.getCollectionConfig(collection)
    if (!collectionConfig) {
      throw new NotFoundError('Collection', collection)
    }

    const cacheKey = `entry:${collection}:${slug}`
    const cached = this.cache.get<Entry>(cacheKey)
    if (cached) return cached

    const filePath = this.getEntryFilePath(collection, slug)
    const exists = await this.fs.exists(filePath)
    if (!exists) return null

    const raw = await this.fs.readFile(filePath)
    const entry = this.parseEntry(collection, slug, raw)
    entry.contentHash = computeContentHash(raw)

    this.cache.set(cacheKey, entry, [filePath])
    return entry
  }

  async listEntries(collection: string, options?: ListOptions): Promise<Entry[]> {
    const collectionConfig = await this.getCollectionConfig(collection)
    if (!collectionConfig) {
      throw new NotFoundError('Collection', collection)
    }

    const cacheKey = `entries:${collection}`
    let entries = this.cache.get<Entry[]>(cacheKey)

    if (!entries) {
      const dir = this.getCollectionDir(collection)
      const dirExists = await this.fs.exists(dir)
      if (!dirExists) {
        entries = []
      } else {
        const files = await this.fs.listFiles(dir, '*.md')
        entries = []
        for (const file of files) {
          const slug = path.basename(file, '.md')
          const filePath = path.join(dir, file)
          const raw = await this.fs.readFile(filePath)
          entries.push(this.parseEntry(collection, slug, raw))
        }
      }
      this.cache.set(cacheKey, entries)
    }

    return this.applyListOptions(entries, options)
  }

  async createEntry(collection: string, data: EntryInput): Promise<Entry> {
    const collectionConfig = await this.getCollectionConfig(collection)
    if (!collectionConfig) {
      throw new NotFoundError('Collection', collection)
    }

    // Check for duplicate slug
    const filePath = this.getEntryFilePath(collection, data.slug)
    const exists = await this.fs.exists(filePath)
    if (exists) {
      throw new ConflictError(`Entry with slug "${data.slug}" already exists in collection "${collection}"`)
    }

    // Validate against blueprint
    await this.validateEntryData(collectionConfig.blueprint, data)

    const now = new Date().toISOString()
    const status = data.status ?? collectionConfig.defaultStatus ?? 'draft'

    const frontmatter: Record<string, unknown> = {
      title: data.title,
      slug: data.slug,
      status,
      createdAt: now,
      updatedAt: now,
    }

    if (data.author) {
      frontmatter.author = data.author
    }

    if (data.data) {
      Object.assign(frontmatter, data.data)
    }

    const content = data.content ?? ''
    const fileContent = this.parser.serializeMarkdown(frontmatter, content)
    const writeResult = await this.atomicWriter.writeFileAtomic(filePath, fileContent)
    if (!writeResult.success) {
      throw writeResult.error ?? new Error(`Atomic write failed for ${filePath}`)
    }

    // Invalidate cache
    this.cache.invalidatePattern(`entries:${collection}*`)

    const entry: Entry = {
      title: data.title,
      slug: data.slug,
      status,
      author: data.author,
      content,
      data: data.data ?? {},
      collection,
      createdAt: now,
      updatedAt: now,
    }

    return entry
  }

  async updateEntry(collection: string, slug: string, data: Partial<EntryInput>, contentHash?: string): Promise<Entry> {
    const collectionConfig = await this.getCollectionConfig(collection)
    if (!collectionConfig) {
      throw new NotFoundError('Collection', collection)
    }

    if (!contentHash) {
      throw new ValidationError(
        'contentHash is required for update operations',
        { contentHash: ['contentHash is required'] }
      )
    }

    const filePath = this.getEntryFilePath(collection, slug)
    const exists = await this.fs.exists(filePath)
    if (!exists) {
      throw new NotFoundError('Entry', `${collection}/${slug}`)
    }

    // Re-read file content and verify hash before writing
    const raw = await this.fs.readFile(filePath)
    verifyContentHash(contentHash, raw)

    // Read existing entry from the raw content
    const existing = this.parseEntry(collection, slug, raw)

    // Merge data
    const merged: EntryInput = {
      title: data.title ?? existing.title,
      slug: data.slug ?? existing.slug,
      status: data.status ?? existing.status,
      author: data.author ?? existing.author,
      content: data.content ?? existing.content,
      data: data.data ? { ...existing.data, ...data.data } : existing.data,
    }

    // Validate against blueprint
    await this.validateEntryData(collectionConfig.blueprint, merged)

    const now = new Date().toISOString()

    const frontmatter: Record<string, unknown> = {
      title: merged.title,
      slug: merged.slug,
      status: merged.status,
      createdAt: existing.createdAt,
      updatedAt: now,
    }

    if (merged.author) {
      frontmatter.author = merged.author
    }

    if (merged.data && Object.keys(merged.data).length > 0) {
      Object.assign(frontmatter, merged.data)
    }

    const fileContent = this.parser.serializeMarkdown(frontmatter, merged.content ?? '')

    // If slug changed, delete old file and write new one
    if (data.slug && data.slug !== slug) {
      const newFilePath = this.getEntryFilePath(collection, data.slug)
      const newExists = await this.fs.exists(newFilePath)
      if (newExists) {
        throw new ConflictError(`Entry with slug "${data.slug}" already exists in collection "${collection}"`)
      }
      await this.fs.deleteFile(filePath)
      const writeResult = await this.atomicWriter.writeFileAtomic(newFilePath, fileContent)
      if (!writeResult.success) {
        throw writeResult.error ?? new Error(`Atomic write failed for ${newFilePath}`)
      }
    } else {
      const writeResult = await this.atomicWriter.writeFileAtomic(filePath, fileContent)
      if (!writeResult.success) {
        throw writeResult.error ?? new Error(`Atomic write failed for ${filePath}`)
      }
    }

    // Invalidate cache
    this.cache.invalidatePattern(`entries:${collection}*`)
    this.cache.invalidate(`entry:${collection}:${slug}`)
    if (data.slug && data.slug !== slug) {
      this.cache.invalidate(`entry:${collection}:${data.slug}`)
    }

    const entry: Entry = {
      title: merged.title,
      slug: merged.slug ?? slug,
      status: merged.status ?? 'draft',
      author: merged.author,
      content: merged.content ?? '',
      data: merged.data ?? {},
      collection,
      createdAt: existing.createdAt,
      updatedAt: now,
      contentHash: computeContentHash(fileContent),
    }

    return entry
  }

  async deleteEntry(collection: string, slug: string): Promise<void> {
    const collectionConfig = await this.getCollectionConfig(collection)
    if (!collectionConfig) {
      throw new NotFoundError('Collection', collection)
    }

    const filePath = this.getEntryFilePath(collection, slug)
    const exists = await this.fs.exists(filePath)
    if (!exists) {
      throw new NotFoundError('Entry', `${collection}/${slug}`)
    }

    await this.fs.deleteFile(filePath)

    // Invalidate cache
    this.cache.invalidatePattern(`entries:${collection}*`)
    this.cache.invalidate(`entry:${collection}:${slug}`)
  }

  // ─── Taxonomies ────────────────────────────────────────────────────────────

  async getTaxonomy(handle: string): Promise<Taxonomy | null> {
    return this.taxonomyOps.getTaxonomy(handle)
  }

  async listTaxonomies(): Promise<Taxonomy[]> {
    return this.taxonomyOps.listTaxonomies()
  }

  async getTerm(taxonomy: string, slug: string): Promise<Term | null> {
    return this.taxonomyOps.getTerm(taxonomy, slug)
  }

  async listTerms(taxonomy: string): Promise<Term[]> {
    return this.taxonomyOps.listTerms(taxonomy)
  }

  // ─── Globals (stub — implemented in task 6.3) ─────────────────────────────

  async getGlobal(_handle: string): Promise<Global | null> {
    throw new Error('Not implemented: getGlobal will be implemented in task 6.3')
  }

  async listGlobals(): Promise<Global[]> {
    throw new Error('Not implemented: listGlobals will be implemented in task 6.3')
  }

  async updateGlobal(_handle: string, _data: Record<string, unknown>): Promise<Global> {
    throw new Error('Not implemented: updateGlobal will be implemented in task 6.3')
  }

  // ─── Navigation (stub — implemented in task 6.3) ──────────────────────────

  async getNavigation(_handle: string): Promise<Navigation | null> {
    throw new Error('Not implemented: getNavigation will be implemented in task 6.3')
  }

  async listNavigations(): Promise<Navigation[]> {
    throw new Error('Not implemented: listNavigations will be implemented in task 6.3')
  }

  // ─── Assets (stub — implemented in task 6.4) ──────────────────────────────

  async getAsset(_path: string): Promise<Asset | null> {
    throw new Error('Not implemented: getAsset will be implemented in task 6.4')
  }

  async listAssets(_directory?: string): Promise<Asset[]> {
    throw new Error('Not implemented: listAssets will be implemented in task 6.4')
  }

  async uploadAsset(_file: File, _directory?: string): Promise<Asset> {
    throw new Error('Not implemented: uploadAsset will be implemented in task 6.4')
  }

  async deleteAsset(_path: string): Promise<void> {
    throw new Error('Not implemented: deleteAsset will be implemented in task 6.4')
  }

  // ─── Forms (stub — implemented in task 6.3) ───────────────────────────────

  async getForm(_handle: string): Promise<Form | null> {
    throw new Error('Not implemented: getForm will be implemented in task 6.3')
  }

  async listForms(): Promise<Form[]> {
    throw new Error('Not implemented: listForms will be implemented in task 6.3')
  }

  async submitForm(_handle: string, _data: Record<string, unknown>): Promise<FormSubmission | null> {
    throw new Error('Not implemented: submitForm will be implemented in task 6.3')
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private getCollectionDir(collection: string): string {
    return path.join(this.config.contentPath, 'collections', collection)
  }

  private getEntryFilePath(collection: string, slug: string): string {
    return path.join(this.config.contentPath, 'collections', collection, `${slug}.md`)
  }

  private parseEntry(collection: string, slug: string, raw: string): Entry {
    const { frontmatter, content } = this.parser.parseMarkdown(raw)

    // Extract known fields from frontmatter
    const { title, status, author, createdAt, updatedAt, slug: _slug, ...data } = frontmatter

    return {
      title: (title as string) ?? slug,
      slug,
      status: (status as 'published' | 'draft') ?? 'draft',
      author: author as string | undefined,
      content,
      data: data as Record<string, unknown>,
      collection,
      createdAt: (createdAt as string) ?? new Date().toISOString(),
      updatedAt: (updatedAt as string) ?? new Date().toISOString(),
    }
  }

  private applyListOptions(entries: Entry[], options?: ListOptions): Entry[] {
    if (!options) return entries

    let result = [...entries]

    // Status filtering
    if (options.status && options.status !== 'all') {
      result = result.filter((e) => e.status === options.status)
    }

    // Filter by field values
    if (options.filter) {
      for (const [field, value] of Object.entries(options.filter)) {
        result = result.filter((e) => {
          const entryValue = this.getEntryFieldValue(e, field)
          return entryValue === value
        })
      }
    }

    // Sort
    if (options.sort) {
      const { field, direction } = options.sort
      result.sort((a, b) => {
        const aVal = this.getEntryFieldValue(a, field)
        const bVal = this.getEntryFieldValue(b, field)

        if (aVal === bVal) return 0
        if (aVal === undefined || aVal === null) return 1
        if (bVal === undefined || bVal === null) return -1

        const comparison = aVal < bVal ? -1 : 1
        return direction === 'desc' ? -comparison : comparison
      })
    }

    // Offset
    if (options.offset) {
      result = result.slice(options.offset)
    }

    // Limit
    if (options.limit) {
      result = result.slice(0, options.limit)
    }

    return result
  }

  private getEntryFieldValue(entry: Entry, field: string): unknown {
    // Check top-level entry fields first
    if (field in entry) {
      return (entry as unknown as Record<string, unknown>)[field]
    }
    // Then check the data bag
    return entry.data[field]
  }

  private async validateEntryData(blueprintHandle: string, data: EntryInput): Promise<void> {
    const blueprint = await this.blueprintRegistry.getBlueprint('collections', blueprintHandle)
    if (!blueprint) {
      // No blueprint found — skip validation
      return
    }

    // Build the data object to validate (combine known fields + custom data)
    const dataToValidate: Record<string, unknown> = {
      title: data.title,
      slug: data.slug,
    }

    if (data.status) {
      dataToValidate.status = data.status
    }

    if (data.author) {
      dataToValidate.author = data.author
    }

    if (data.content) {
      dataToValidate.content = data.content
    }

    if (data.data) {
      Object.assign(dataToValidate, data.data)
    }

    const result = this.blueprintRegistry.validateData(blueprint, dataToValidate)
    if (!result.success) {
      throw new ValidationError(
        `Entry data validation failed for blueprint "${blueprintHandle}"`,
        result.errors ?? {}
      )
    }
  }
}
