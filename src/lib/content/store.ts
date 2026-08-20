import * as path from 'path'
import { UniversalFileParser, type FileFormat } from '@/lib/fs/parser'
import { AtomicFileWriter } from '@/lib/fs/atomic-writer'
import { NodeFileSystemAdapter, type FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentMutationReporter } from '@/lib/mutations'
import { noOpContentMutationReporter } from '@/lib/mutations'

export interface NavigationItem {
  [key: string]: unknown
  children?: NavigationItem[]
}

export interface NavigationData {
  items: NavigationItem[]
}

export interface ContentEntry {
  id: string
  data: Record<string, unknown>
  format: FileFormat
  path: string
}

export interface IContentStore {
  // Taxonomy terms
  listTerms(taxonomyHandle: string): Promise<ContentEntry[]>
  getTerm(taxonomyHandle: string, termSlug: string): Promise<ContentEntry | null>
  createTerm(taxonomyHandle: string, slug: string, data: Record<string, unknown>): Promise<ContentEntry>
  updateTerm(taxonomyHandle: string, slug: string, data: Record<string, unknown>): Promise<ContentEntry>
  deleteTerm(taxonomyHandle: string, slug: string): Promise<void>

  // Form submissions
  listSubmissions(formHandle: string): Promise<ContentEntry[]>
  getSubmission(formHandle: string, id: string): Promise<ContentEntry | null>
  createSubmission(formHandle: string, data: Record<string, unknown>): Promise<ContentEntry>
  deleteSubmission(formHandle: string, id: string): Promise<void>
}

export class ContentStore implements IContentStore {
  private parser: UniversalFileParser
  private contentPath: string
  private atomicWriter: AtomicFileWriter

  constructor(contentPath: string = './content', private readonly fs: FileSystemAdapter = new NodeFileSystemAdapter(), private readonly mutations: ContentMutationReporter = noOpContentMutationReporter) {
    this.parser = new UniversalFileParser()
    this.contentPath = path.resolve(contentPath)
    this.atomicWriter = new AtomicFileWriter(fs)
  }

  // --- Globals ---

  /**
   * Get global data by handle.
   * Reads from content/globals/{handle}.yaml or .json.
   * Returns {} if file doesn't exist.
   */
  async getGlobal(handle: string): Promise<Record<string, unknown>> {
    this.assertIdentifier(handle, 'global handle')
    const filePath = await this.resolveFile('globals', handle)
    if (!filePath) return {}

    const content = await this.fs.readFile(filePath)
    return this.parser.parse<Record<string, unknown>>(filePath, content)
  }

  /**
   * Update global data by handle.
   * Preserves format if file exists, defaults to YAML for new files.
   */
  async updateGlobal(handle: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.assertIdentifier(handle, 'global handle')
    const existingPath = await this.resolveFile('globals', handle)
    let filePath: string
    let format: FileFormat

    if (existingPath) {
      filePath = existingPath
      format = this.parser.detectFormat(existingPath)
    } else {
      const dir = this.contentDirectory('globals')
      await this.fs.mkdir(dir)
      filePath = `${dir}/${handle}.yaml`
      format = 'yaml'
    }

    const content = this.parser.serialize(data, format)
    await this.writeFileAtomic(filePath, content)
    this.report('update', [filePath], 'global', handle, handle, `Updated global ${handle}`)
    return data
  }

  // --- Navigation ---

  /**
   * Get navigation data by handle.
   * Reads from content/navigation/{handle}.yaml or .json.
   * Returns { items: [] } if file doesn't exist.
   */
  async getNavigation(handle: string): Promise<NavigationData> {
    this.assertIdentifier(handle, 'navigation handle')
    const filePath = await this.resolveFile('navigation', handle)
    if (!filePath) return { items: [] }

    const content = await this.fs.readFile(filePath)
    const parsed = this.parser.parse<NavigationData>(filePath, content)
    return parsed ?? { items: [] }
  }

  /**
   * Update navigation data by handle.
   * Preserves format if file exists, defaults to YAML for new files.
   */
  async updateNavigation(handle: string, data: NavigationData): Promise<NavigationData> {
    this.assertIdentifier(handle, 'navigation handle')
    const existingPath = await this.resolveFile('navigation', handle)
    let filePath: string
    let format: FileFormat

    if (existingPath) {
      filePath = existingPath
      format = this.parser.detectFormat(existingPath)
    } else {
      const dir = this.contentDirectory('navigation')
      await this.fs.mkdir(dir)
      filePath = `${dir}/${handle}.yaml`
      format = 'yaml'
    }

    const content = this.parser.serialize(data, format)
    await this.writeFileAtomic(filePath, content)
    this.report('update', [filePath], 'navigation', handle, handle, `Updated navigation ${handle}`)
    return data
  }

  // --- Taxonomy Terms ---

  async listTerms(taxonomyHandle: string): Promise<ContentEntry[]> {
    this.assertIdentifier(taxonomyHandle, 'taxonomy handle')
    const dir = this.contentDirectory('taxonomies', taxonomyHandle)
    if (!(await this.directoryExists(dir))) return []

    const files = await this.fs.listFiles(dir, '*.{yaml,yml,json}')
    const entries: ContentEntry[] = []

    for (const file of files) {
      const filePath = `${dir}/${file}`
      const content = await this.fs.readFile(filePath)
      const data = this.parser.parse<Record<string, unknown>>(filePath, content)
      const id = path.basename(file, path.extname(file))
      entries.push({ id, data, format: this.parser.detectFormat(filePath), path: filePath })
    }

    return entries
  }

  async getTerm(taxonomyHandle: string, termSlug: string): Promise<ContentEntry | null> {
    this.assertIdentifier(taxonomyHandle, 'taxonomy handle')
    this.assertIdentifier(termSlug, 'term slug')
    const filePath = await this.resolveFile(`taxonomies/${taxonomyHandle}`, termSlug)
    if (!filePath) return null

    const content = await this.fs.readFile(filePath)
    const data = this.parser.parse<Record<string, unknown>>(filePath, content)
    return { id: termSlug, data, format: this.parser.detectFormat(filePath), path: filePath }
  }

  async createTerm(taxonomyHandle: string, slug: string, data: Record<string, unknown>): Promise<ContentEntry> {
    this.assertIdentifier(taxonomyHandle, 'taxonomy handle')
    this.assertIdentifier(slug, 'term slug')
    const dir = this.contentDirectory('taxonomies', taxonomyHandle)
    await this.fs.mkdir(dir)

    const filePath = `${dir}/${slug}.yaml`
    const content = this.parser.serialize(data, 'yaml')
    await this.writeFileAtomic(filePath, content)
    this.report('create', [filePath], 'term', taxonomyHandle, slug, `Created term ${taxonomyHandle}/${slug}`)

    return { id: slug, data, format: 'yaml', path: filePath }
  }

  async updateTerm(taxonomyHandle: string, slug: string, data: Record<string, unknown>): Promise<ContentEntry> {
    this.assertIdentifier(taxonomyHandle, 'taxonomy handle')
    this.assertIdentifier(slug, 'term slug')
    const existingPath = await this.resolveFile(`taxonomies/${taxonomyHandle}`, slug)
    let filePath: string
    let format: FileFormat

    if (existingPath) {
      filePath = existingPath
      format = this.parser.detectFormat(existingPath)
    } else {
      const dir = this.contentDirectory('taxonomies', taxonomyHandle)
      await this.fs.mkdir(dir)
      filePath = `${dir}/${slug}.yaml`
      format = 'yaml'
    }

    const content = this.parser.serialize(data, format)
    await this.writeFileAtomic(filePath, content)
    this.report(existingPath ? 'update' : 'create', [filePath], 'term', taxonomyHandle, slug, `${existingPath ? 'Updated' : 'Created'} term ${taxonomyHandle}/${slug}`)
    return { id: slug, data, format, path: filePath }
  }

  async deleteTerm(taxonomyHandle: string, slug: string): Promise<void> {
    this.assertIdentifier(taxonomyHandle, 'taxonomy handle')
    this.assertIdentifier(slug, 'term slug')
    const filePath = await this.resolveFile(`taxonomies/${taxonomyHandle}`, slug)
    if (filePath) {
      await this.fs.deleteFile(filePath)
      this.report('delete', [filePath], 'term', taxonomyHandle, slug, `Deleted term ${taxonomyHandle}/${slug}`)
    }
  }

  // --- Form Submissions ---

  async listSubmissions(formHandle: string): Promise<ContentEntry[]> {
    this.assertIdentifier(formHandle, 'form handle')
    const dir = this.contentDirectory('forms', formHandle)
    if (!(await this.directoryExists(dir))) return []

    const files = await this.fs.listFiles(dir, '*.{yaml,yml,json}')
    const entries: ContentEntry[] = []

    for (const file of files) {
      const filePath = `${dir}/${file}`
      const content = await this.fs.readFile(filePath)
      const data = this.parser.parse<Record<string, unknown>>(filePath, content)
      const id = path.basename(file, path.extname(file))
      entries.push({ id, data, format: this.parser.detectFormat(filePath), path: filePath })
    }

    return entries
  }

  async getSubmission(formHandle: string, id: string): Promise<ContentEntry | null> {
    this.assertIdentifier(formHandle, 'form handle')
    this.assertIdentifier(id, 'submission id')
    const filePath = await this.resolveFile(`forms/${formHandle}`, id)
    if (!filePath) return null

    const content = await this.fs.readFile(filePath)
    const data = this.parser.parse<Record<string, unknown>>(filePath, content)
    return { id, data, format: this.parser.detectFormat(filePath), path: filePath }
  }

  async createSubmission(formHandle: string, data: Record<string, unknown>): Promise<ContentEntry> {
    this.assertIdentifier(formHandle, 'form handle')
    const dir = this.contentDirectory('forms', formHandle)
    await this.fs.mkdir(dir)

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    const filePath = `${dir}/${id}.yaml`
    const content = this.parser.serialize(data, 'yaml')
    await this.writeFileAtomic(filePath, content)
    this.report('create', [filePath], 'form-submission', formHandle, id, `Stored submission for ${formHandle}`)

    return { id, data, format: 'yaml', path: filePath }
  }

  async deleteSubmission(formHandle: string, id: string): Promise<void> {
    this.assertIdentifier(formHandle, 'form handle')
    this.assertIdentifier(id, 'submission id')
    const filePath = await this.resolveFile(`forms/${formHandle}`, id)
    if (filePath) {
      await this.fs.deleteFile(filePath)
      this.report('delete', [filePath], 'form-submission', formHandle, id, `Deleted submission ${id} from ${formHandle}`)
    }
  }

  // --- Private Helpers ---

  /**
   * Resolve a file by checking for .yaml, .yml, and .json extensions.
   * Returns the full path if found, null otherwise.
   */
  private async resolveFile(subdir: string, handle: string): Promise<string | null> {
    const dir = this.contentDirectory(subdir)
    const extensions = ['.yaml', '.yml', '.json']

    for (const ext of extensions) {
      const filePath = `${dir}/${handle}${ext}`
      if (await this.fs.exists(filePath)) {
        return filePath
      }
    }

    return null
  }

  private async directoryExists(dirPath: string): Promise<boolean> {
    return this.fs.exists(dirPath)
  }

  /** Compose runtime content paths without asking NFT to trace project root. */
  private contentDirectory(...segments: string[]): string {
    const pathSegments = segments.flatMap((segment) => segment.split(/[\\/]/))
    for (const segment of pathSegments) {
      this.assertIdentifier(segment, 'content path segment')
    }
    return `${this.contentPath.replace(/[\\/]$/, '')}/${pathSegments.join('/')}`
  }

  private assertIdentifier(value: string, label: string): void {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)) {
      throw new Error(`Invalid ${label}: ${value}`)
    }
  }

  private async writeFileAtomic(filePath: string, content: string): Promise<void> {
    const result = await this.atomicWriter.writeFileAtomic(filePath, content)
    if (!result.success) {
      throw result.error ?? new Error(`Could not write content: ${filePath}`)
    }
  }

  private report(action: 'create' | 'update' | 'delete', paths: string[], type: string, handle: string, id: string, message: string): void {
    this.mutations.report({ action, paths, resource: { type, handle, id }, message, source: 'system', timestamp: Date.now() })
  }
}
