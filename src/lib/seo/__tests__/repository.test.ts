import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import { ContentMutationBus } from '@/lib/mutations'
import { FileSeoRepository } from '@/lib/seo/repositories'
import { SEO_DOCUMENT_VERSION, SeoDocumentSchema, SeoValuesSchema } from '@/lib/seo/domain'
import { SeoRevisionConflictError, SeoStorageError } from '@/lib/seo/storage'

class MemoryFs implements FileSystemAdapter {
  readonly files = new Map<string, string>()
  async readFile(filePath: string) { const value = this.files.get(filePath); if (value === undefined) throw new Error('missing'); return value }
  async writeFile(filePath: string, content: string) { this.files.set(filePath, content) }
  async deleteFile(filePath: string) { this.files.delete(filePath) }
  async exists(filePath: string) { return this.files.has(filePath) || [...this.files.keys()].some(key => key.startsWith(`${filePath}/`)) }
  async listFiles(directory: string, pattern?: string) { return [...this.files.keys()].filter(key => path.dirname(key) === directory && (!pattern || key.endsWith('.yaml'))).map(key => path.basename(key)) }
  async listDirectories() { return [] }
  async mkdir() {}
  async copyFile(src: string, dest: string) { this.files.set(dest, await this.readFile(src)) }
  async moveFile(src: string, dest: string) { const value = await this.readFile(src); this.files.set(dest, value); this.files.delete(src) }
}

const site = (name = 'default') => ({ version: SEO_DOCUMENT_VERSION, kind: 'site' as const, site: name, seo: { title: { kind: 'template' as const, value: '{title} — {site_name}' }, robots: { indexing: 'index' as const } } })

describe('SEO domain schemas', () => {
  it('rejects unsafe sources and malformed custom JSON-LD', () => {
    expect(() => SeoValuesSchema.parse({ title: { kind: 'literal', value: 'one\ntwo' } })).toThrow()
    expect(() => SeoValuesSchema.parse({ jsonLd: { type: 'custom' } })).toThrow()
    expect(() => SeoDocumentSchema.parse({ ...site(), extra: true })).toThrow()
    const deeplyNested = { nested: { a: { b: { c: { d: { e: { f: { g: { h: 'too deep' } } } } } } } } }
    expect(() => SeoValuesSchema.parse({ jsonLd: { type: 'custom', custom: deeplyNested } })).toThrow()
    expect(() => SeoValuesSchema.parse({ jsonLd: { type: 'custom', custom: Object.fromEntries(Array.from({ length: 201 }, (_, index) => [`key${index}`, index])) } })).toThrow()
  })

  it('accepts explicit inheritance and disabled values', () => {
    expect(SeoValuesSchema.parse({ title: { kind: 'inherit' }, description: { kind: 'disabled' } })).toEqual({ title: { kind: 'inherit' }, description: { kind: 'disabled' } })
  })

  it('round-trips bounded custom JSON-LD record values', () => {
    const values = SeoValuesSchema.parse({ jsonLd: { enabled: true, type: 'custom', custom: { headline: 'Example', position: 1 } } })
    expect(SeoValuesSchema.parse(values)).toEqual(values)
  })
})

describe('FileSeoRepository', () => {
  it('atomically persists versioned settings, emits durable mutation, and returns immutable snapshots', async () => {
    const fs = new MemoryFs(); const bus = new ContentMutationBus(); const events: string[] = []; bus.onMutation(event => events.push(event.action))
    const repository = new FileSeoRepository(fs, new MarkdownYamlParser(), '/project/resources', bus)
    const saved = await repository.saveSite(site())
    expect(saved.path).toBe('/project/resources/seo/sites/default.yaml')
    expect(saved.revision).toHaveLength(64)
    expect(events).toEqual(['create'])
    expect(Object.isFrozen(saved.document)).toBe(true)
    expect(await repository.getSite('default')).toEqual(saved)
  })

  it('uses compare-and-swap revisions so concurrent editors cannot overwrite data', async () => {
    const repository = new FileSeoRepository(new MemoryFs(), new MarkdownYamlParser(), '/project/resources')
    const first = await repository.saveSite(site())
    const changed = { ...site(), seo: { enabled: false } }
    await repository.saveSite(changed, { expectedRevision: first.revision })
    await expect(repository.saveSite(site(), { expectedRevision: first.revision })).rejects.toBeInstanceOf(SeoRevisionConflictError)
  })

  it('contains paths and rejects traversal/non-handle identifiers', async () => {
    const repository = new FileSeoRepository(new MemoryFs(), new MarkdownYamlParser(), '/project/resources')
    await expect(repository.getSite('../outside')).rejects.toBeInstanceOf(SeoStorageError)
    await expect(repository.getSection('collection', 'hello/world')).rejects.toBeInstanceOf(SeoStorageError)
  })

  it('lists only documents in requested storage directory', async () => {
    const repository = new FileSeoRepository(new MemoryFs(), new MarkdownYamlParser(), '/project/resources')
    await repository.saveSite(site('alpha')); await repository.saveSite(site('beta'))
    await repository.saveSection({ version: SEO_DOCUMENT_VERSION, kind: 'section', section: 'collection', handle: 'posts', seo: {} })
    expect((await repository.listSites()).map(value => value.document.site)).toEqual(['alpha', 'beta'])
    expect((await repository.listSections('collection')).map(value => value.document.handle)).toEqual(['posts'])
  })
})
