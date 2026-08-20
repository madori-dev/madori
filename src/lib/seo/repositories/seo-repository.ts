import * as path from 'node:path'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'
import { AtomicFileWriter } from '@/lib/fs/atomic-writer'
import type { ContentMutationReporter } from '@/lib/mutations'
import { noOpContentMutationReporter } from '@/lib/mutations'
import { parseSeoDocument, type SeoDocument, type SeoDocumentSnapshot, type SeoSectionDocument, type SeoSectionKind, type SeoSiteDocument, type SeoWriteOptions } from '@/lib/seo/domain'
import { SeoRevisionConflictError, SeoStorageError } from '@/lib/seo/storage/errors'
import { assertSafeStoragePath, immutable, pathWithin, revisionFor } from '@/lib/seo/storage/utils'
import { seoStorageLock } from '@/lib/seo/storage/lock'

const SAFE_HANDLE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

/**
 * Git-friendly versioned SEO settings. Item values remain frontmatter and are
 * intentionally handled by content services, while site/section cascade layers live here.
 */
export class FileSeoRepository {
  private readonly atomicWriter: AtomicFileWriter
  private readonly root: string

  constructor(
    private readonly fs: FileSystemAdapter,
    private readonly parser: ContentParser,
    resourcesPath: string,
    private readonly mutations: ContentMutationReporter = noOpContentMutationReporter,
  ) {
    this.root = path.resolve(resourcesPath, 'seo')
    this.atomicWriter = new AtomicFileWriter(fs)
  }

  async getSite(site: string): Promise<SeoDocumentSnapshot<SeoSiteDocument> | null> {
    return this.read<SeoSiteDocument>(this.sitePath(site))
  }

  async getSection(section: SeoSectionKind, handle: string): Promise<SeoDocumentSnapshot<SeoSectionDocument> | null> {
    return this.read<SeoSectionDocument>(this.sectionPath(section, handle))
  }

  async listSites(): Promise<readonly SeoDocumentSnapshot<SeoSiteDocument>[]> {
    return this.list<SeoSiteDocument>(path.join(this.root, 'sites'))
  }

  async listSections(section: SeoSectionKind): Promise<readonly SeoDocumentSnapshot<SeoSectionDocument>[]> {
    return this.list<SeoSectionDocument>(path.join(this.root, 'sections', section))
  }

  async saveSite(document: SeoSiteDocument, options: SeoWriteOptions = {}): Promise<SeoDocumentSnapshot<SeoSiteDocument>> {
    return this.save(document, this.sitePath(document.site), options)
  }

  async saveSection(document: SeoSectionDocument, options: SeoWriteOptions = {}): Promise<SeoDocumentSnapshot<SeoSectionDocument>> {
    return this.save(document, this.sectionPath(document.section, document.handle), options)
  }

  async deleteSite(site: string, options: SeoWriteOptions = {}): Promise<boolean> { return this.delete(this.sitePath(site), options) }
  async deleteSection(section: SeoSectionKind, handle: string, options: SeoWriteOptions = {}): Promise<boolean> { return this.delete(this.sectionPath(section, handle), options) }

  private sitePath(site: string): string { return this.safePath('sites', site) }
  private sectionPath(section: SeoSectionKind, handle: string): string {
    if (section !== 'collection' && section !== 'taxonomy') throw new SeoStorageError('Invalid SEO section kind')
    return this.safePath('sections', section, handle)
  }

  private safePath(...parts: string[]): string {
    if (parts.some(part => !SAFE_HANDLE.test(part))) throw new SeoStorageError('Invalid SEO storage identifier')
    const candidate = path.resolve(this.root, ...parts.slice(0, -1), `${parts.at(-1)}.yaml`)
    if (!pathWithin(this.root, candidate)) throw new SeoStorageError('SEO storage path escapes configured root')
    return candidate
  }

  private async read<T extends SeoDocument>(filePath: string): Promise<SeoDocumentSnapshot<T> | null> {
    await assertSafeStoragePath(this.fs, this.root, filePath)
    if (!await this.fs.exists(filePath)) return null
    const raw = await this.fs.readFile(filePath)
    const document = parseSeoDocument(this.parser.parseYaml<unknown>(raw)) as T
    return immutable({ document: immutable(document), revision: revisionFor(raw), path: filePath })
  }

  private async list<T extends SeoDocument>(directory: string): Promise<readonly SeoDocumentSnapshot<T>[]> {
    await assertSafeStoragePath(this.fs, this.root, directory)
    if (!await this.fs.exists(directory)) return immutable([])
    const files = await this.fs.listFiles(directory, '*.yaml')
    const records = await Promise.all(files.map(file => this.read<T>(path.join(directory, file))))
    return immutable(records.filter((record): record is SeoDocumentSnapshot<T> => record !== null).sort((a, b) => a.path.localeCompare(b.path)))
  }

  private async save<T extends SeoDocument>(document: T, filePath: string, options: SeoWriteOptions): Promise<SeoDocumentSnapshot<T>> {
    const validated = parseSeoDocument(document) as T
    return seoStorageLock.run(filePath, async () => {
      await assertSafeStoragePath(this.fs, this.root, filePath)
      const current = await this.read<T>(filePath)
      if (options.expectedRevision !== undefined && options.expectedRevision !== current?.revision) throw new SeoRevisionConflictError(filePath)
      const raw = this.parser.serializeYaml(validated)
      const result = await this.atomicWriter.writeFileAtomic(filePath, raw)
      if (!result.success) throw result.error ?? new SeoStorageError(`Could not save SEO document: ${filePath}`)
      this.mutations.report({ action: current ? 'update' : 'create', paths: [filePath], resource: { type: 'seo', handle: validated.kind === 'site' ? validated.site : validated.section, id: validated.kind === 'site' ? validated.site : validated.handle }, message: `${current ? 'Updated' : 'Created'} SEO ${validated.kind} settings`, source: 'system', timestamp: Date.now() })
      return immutable({ document: immutable(validated), revision: revisionFor(raw), path: filePath })
    })
  }

  private async delete(filePath: string, options: SeoWriteOptions): Promise<boolean> {
    return seoStorageLock.run(filePath, async () => {
      await assertSafeStoragePath(this.fs, this.root, filePath)
      const current = await this.read(filePath)
      if (!current) return false
      if (options.expectedRevision !== undefined && options.expectedRevision !== current.revision) throw new SeoRevisionConflictError(filePath)
      await this.fs.deleteFile(filePath)
      this.mutations.report({ action: 'delete', paths: [filePath], resource: { type: 'seo' }, message: 'Deleted SEO settings', source: 'system', timestamp: Date.now() })
      return true
    })
  }
}
