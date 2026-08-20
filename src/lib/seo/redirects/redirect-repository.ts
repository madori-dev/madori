import * as path from 'node:path'
import { AtomicFileWriter } from '@/lib/fs/atomic-writer'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'
import type { ContentMutationReporter } from '@/lib/mutations'
import { noOpContentMutationReporter } from '@/lib/mutations'
import { SeoRevisionConflictError, SeoStorageError } from '@/lib/seo/storage/errors'
import { seoStorageLock } from '@/lib/seo/storage/lock'
import { assertSafeStoragePath, immutable, pathWithin, revisionFor } from '@/lib/seo/storage/utils'
import { normalizeRedirectDestination, parseSeoRedirect, type RedirectDestinationPolicy } from './schema'
import type { RedirectWriteOptions, SeoRedirect, SeoRedirectSnapshot } from './types'

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

export type RedirectRepositoryOptions = RedirectDestinationPolicy

/** Stores authored redirects in content/seo/redirects so Git integration can sync them. */
export class FileSeoRedirectRepository {
  private readonly root: string
  private readonly writer: AtomicFileWriter

  constructor(
    private readonly fs: FileSystemAdapter,
    private readonly parser: ContentParser,
    contentPath: string,
    private readonly mutations: ContentMutationReporter = noOpContentMutationReporter,
    private readonly options: RedirectRepositoryOptions = {},
  ) {
    this.root = path.resolve(contentPath, 'seo', 'redirects')
    this.writer = new AtomicFileWriter(fs)
  }

  async get(id: string): Promise<SeoRedirectSnapshot | null> { return this.read(this.filePath(id)) }

  async list(site?: string): Promise<readonly SeoRedirectSnapshot[]> {
    await assertSafeStoragePath(this.fs, this.root, this.root)
    if (!await this.fs.exists(this.root)) return immutable([])
    const names = await this.fs.listFiles(this.root, '*.yaml')
    const records = await Promise.all(names.map(name => this.read(path.join(this.root, name))))
    return immutable(records.filter((record): record is SeoRedirectSnapshot => record !== null)
      .filter(record => !site || record.redirect.site === site)
      .sort((a, b) => a.redirect.id.localeCompare(b.redirect.id)))
  }

  async save(redirect: SeoRedirect, options: RedirectWriteOptions = {}): Promise<SeoRedirectSnapshot> {
    const validated = parseSeoRedirect(redirect, this.options)
    const filePath = this.filePath(validated.id)
    return seoStorageLock.run(`${this.root}:site:${validated.site}`, async () => {
      await assertSafeStoragePath(this.fs, this.root, filePath)
      const current = await this.read(filePath)
      if (options.expectedRevision !== undefined && options.expectedRevision !== current?.revision) {
        throw new SeoRevisionConflictError(filePath)
      }
      await this.assertTopology(validated)
      const raw = this.parser.serializeYaml(validated)
      const result = await this.writer.writeFileAtomic(filePath, raw)
      if (!result.success) throw result.error ?? new SeoStorageError(`Could not save redirect: ${filePath}`)
      this.mutations.report({
        action: current ? 'update' : 'create', paths: [filePath], resource: { type: 'seo-redirect', handle: validated.site, id: validated.id },
        message: `${current ? 'Updated' : 'Created'} SEO redirect`, source: 'system', timestamp: Date.now(),
      })
      return immutable({ redirect: immutable(validated), revision: revisionFor(raw), path: filePath })
    })
  }

  async delete(id: string, options: RedirectWriteOptions = {}): Promise<boolean> {
    const filePath = this.filePath(id)
    const current = await this.read(filePath)
    if (!current) return false
    return seoStorageLock.run(`${this.root}:site:${current.redirect.site}`, async () => {
      await assertSafeStoragePath(this.fs, this.root, filePath)
      const latest = await this.read(filePath)
      if (!latest) return false
      if (options.expectedRevision !== undefined && options.expectedRevision !== latest.revision) throw new SeoRevisionConflictError(filePath)
      await this.fs.deleteFile(filePath)
      this.mutations.report({ action: 'delete', paths: [filePath], resource: { type: 'seo-redirect', handle: latest.redirect.site, id }, message: 'Deleted SEO redirect', source: 'system', timestamp: Date.now() })
      return true
    })
  }

  private filePath(id: string): string {
    if (!SAFE_ID.test(id)) throw new SeoStorageError('Redirect ID must be filename-safe.')
    const candidate = path.resolve(this.root, `${id}.yaml`)
    if (!pathWithin(this.root, candidate)) throw new SeoStorageError('Redirect path escapes configured root.')
    return candidate
  }

  private async read(filePath: string): Promise<SeoRedirectSnapshot | null> {
    await assertSafeStoragePath(this.fs, this.root, filePath)
    if (!await this.fs.exists(filePath)) return null
    const raw = await this.fs.readFile(filePath)
    const redirect = parseSeoRedirect(this.parser.parseYaml<unknown>(raw), this.options)
    return immutable({ redirect: immutable(redirect), revision: revisionFor(raw), path: filePath })
  }

  private async assertTopology(candidate: SeoRedirect): Promise<void> {
    if (!candidate.enabled) return
    if (candidate.destination.startsWith('/') && normalizeRedirectDestination(candidate.destination) === candidate.source) {
      throw new SeoStorageError('Redirect cannot point to itself.')
    }
    const active = (await this.list(candidate.site)).map(record => record.redirect)
      .filter(redirect => redirect.enabled && redirect.id !== candidate.id)
    if (active.some(redirect => redirect.source === candidate.source)) throw new SeoStorageError('An active redirect already owns this source path.')

    const graph = new Map<string, string>()
    for (const redirect of [...active, candidate]) {
      if (redirect.destination.startsWith('/')) graph.set(redirect.source, redirect.destination)
    }
    for (const source of graph.keys()) {
      const seen = new Set<string>()
      let node: string | undefined = source
      while (node && graph.has(node)) {
        if (seen.has(node)) throw new SeoStorageError('Redirect cycle detected.')
        seen.add(node)
        node = graph.get(node)
      }
    }
    for (const destination of graph.values()) {
      if (graph.has(destination)) throw new SeoStorageError('Redirect chains are not allowed.')
    }
  }
}
