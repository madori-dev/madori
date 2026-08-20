import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import { ContentMutationBus } from '@/lib/mutations'
import {
  FileSeoRedirectRepository,
  NotFoundObservationStore,
  SEO_REDIRECT_VERSION,
  promoteNotFoundObservation,
  resolveRedirect,
} from '@/lib/seo/redirects'
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
  async copyFile(source: string, destination: string) { this.files.set(destination, await this.readFile(source)) }
  async moveFile(source: string, destination: string) { const value = await this.readFile(source); this.files.set(destination, value); this.files.delete(source) }
}

const redirect = (overrides: Partial<{ id: string; source: string; destination: string; status: 301 | 302 | 307 | 308; site: string; enabled: boolean }> = {}) => ({
  version: SEO_REDIRECT_VERSION,
  id: 'redirect-1', site: 'en', source: '/old-page', destination: '/new-page', status: 301 as const, enabled: true,
  ...overrides,
})

describe('Git-authored SEO redirects', () => {
  it('stores atomic versioned redirects under content/seo/redirects and reports durable mutations', async () => {
    const fs = new MemoryFs(); const mutations = new ContentMutationBus(); const events: string[] = []
    mutations.onMutation(event => events.push(event.action))
    const repository = new FileSeoRedirectRepository(fs, new MarkdownYamlParser(), '/project/content', mutations)
    const saved = await repository.save(redirect())
    expect(saved.path).toBe('/project/content/seo/redirects/redirect-1.yaml')
    expect(saved.revision).toHaveLength(64)
    expect(events).toEqual(['create'])
    expect(await repository.get('redirect-1')).toEqual(saved)
  })

  it('rejects unsafe paths, credential destinations, duplicate sources, self loops, chains, cycles and traversal IDs', async () => {
    const repository = new FileSeoRedirectRepository(new MemoryFs(), new MarkdownYamlParser(), '/project/content')
    await expect(repository.save(redirect({ source: '/a/../secret' }))).rejects.toThrow()
    await expect(repository.save(redirect({ destination: 'https://user:secret@example.test' }))).rejects.toThrow()
    await expect(repository.save(redirect({ destination: 'https://example.test/%0ASet-Cookie' }))).rejects.toThrow()
    await expect(repository.get('../secret')).rejects.toBeInstanceOf(SeoStorageError)
    await expect(repository.save(redirect({ destination: '/old-page' }))).rejects.toThrow('itself')
    await repository.save(redirect())
    await expect(repository.save(redirect({ id: 'copy', destination: '/different' }))).rejects.toThrow('owns this source')
    await expect(repository.save(redirect({ id: 'chain', source: '/legacy', destination: '/old-page' }))).rejects.toThrow('chains')

    const cycles = new FileSeoRedirectRepository(new MemoryFs(), new MarkdownYamlParser(), '/project/content')
    await cycles.save(redirect({ source: '/a', destination: '/b' }))
    await expect(cycles.save(redirect({ id: 'cycle', source: '/b', destination: '/a' }))).rejects.toThrow('cycle')
  })

  it('uses compare-and-swap edits and resolves only exact site-safe sources', async () => {
    const repository = new FileSeoRedirectRepository(new MemoryFs(), new MarkdownYamlParser(), '/project/content')
    const saved = await repository.save(redirect({ source: '/café' }))
    await repository.save(redirect({ source: '/café', destination: '/newer' }), { expectedRevision: saved.revision })
    await expect(repository.save(redirect({ source: '/café', destination: '/again' }), { expectedRevision: saved.revision })).rejects.toBeInstanceOf(SeoRevisionConflictError)
    const records = (await repository.list()).map(record => record.redirect)
    expect(resolveRedirect(records, 'en', '/caf%C3%A9')).toMatchObject({ destination: '/newer', status: 301 })
    expect(resolveRedirect(records, 'fr', '/caf%C3%A9')).toBeNull()
  })

  it('serializes same-site topology and allows external targets only by explicit origin policy', async () => {
    const fs = new MemoryFs()
    const repository = new FileSeoRedirectRepository(fs, new MarkdownYamlParser(), '/project/content')
    await expect(repository.save(redirect({ destination: 'https://partner.example/new' }))).rejects.toThrow('not allowed by policy')
    const allowed = new FileSeoRedirectRepository(fs, new MarkdownYamlParser(), '/project/content', undefined, {
      allowedExternalOrigins: ['https://partner.example'],
    })
    await expect(allowed.save(redirect({ destination: 'https://partner.example/new' }))).resolves.toMatchObject({ redirect: { destination: 'https://partner.example/new' } })

    const casRepository = new FileSeoRedirectRepository(new MemoryFs(), new MarkdownYamlParser(), '/project/content')
    const first = await casRepository.save(redirect({ id: 'cas', source: '/cas' }))
    const outcomes = await Promise.allSettled([
      casRepository.save(redirect({ id: 'cas', source: '/cas', destination: '/one' }), { expectedRevision: first.revision }),
      casRepository.save(redirect({ id: 'cas', source: '/cas', destination: '/two' }), { expectedRevision: first.revision }),
    ])
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter(result => result.status === 'rejected')).toHaveLength(1)
  })
})

describe('404 observations', () => {
  it('persists only aggregate, redacted data and strips referrer paths, query strings and credentials', async () => {
    const fs = new MemoryFs(); const store = new NotFoundObservationStore(fs, '/project/storage/seo')
    const first = await store.observe({ site: 'en', path: '/missing', query: 'email=person@example.test', referrer: 'https://search.example/query?q=private' })
    const second = await store.observe({ site: 'en', path: '/missing', query: 'different', referrer: 'https://ignored.example/path' })
    expect(first.observations[0]).toMatchObject({ query: 'redacted', referrerOrigin: 'https://search.example', hits: 1 })
    expect(second.observations[0]).toMatchObject({ query: 'redacted', referrerOrigin: 'https://search.example', hits: 2 })
    const raw = [...fs.files.values()].join('\n')
    expect(raw).not.toContain('person@example.test')
    expect(raw).not.toContain('/query')
    expect(raw).not.toContain('different')
  })

  it('bounds retention and requires revisions when supplied', async () => {
    const store = new NotFoundObservationStore(new MemoryFs(), '/project/storage/seo', { maxRecords: 1, retentionDays: 1 })
    const first = await store.observe({ site: 'en', path: '/one', observedAt: new Date('2026-08-01T00:00:00.000Z') })
    const second = await store.observe({ site: 'en', path: '/two', observedAt: new Date('2026-08-03T00:00:00.000Z') })
    expect(second.observations).toHaveLength(1)
    await expect(store.observe({ site: 'en', path: '/three' }, first.revision!)).rejects.toBeInstanceOf(SeoRevisionConflictError)
    expect(await store.delete(second.observations[0].opaqueId, second.revision!)).toBe(true)
    expect((await store.list()).observations).toHaveLength(0)
  })

  it('merges concurrent observations without losing increments', async () => {
    const store = new NotFoundObservationStore(new MemoryFs(), '/project/storage/seo')
    await Promise.all(Array.from({ length: 20 }, () => store.observe({ site: 'en', path: '/missing' })))
    expect((await store.list()).observations).toMatchObject([{ site: 'en', path: '/missing', hits: 20 }])
  })

  it('makes a safe promotion suggestion and rejects unsafe operational inputs', async () => {
    expect(promoteNotFoundObservation('en', '/missing', '/new-home')).toEqual({ site: 'en', source: '/missing', destination: '/new-home', status: 301, enabled: true })
    const store = new NotFoundObservationStore(new MemoryFs(), '/project/storage/seo')
    await expect(store.observe({ site: '../en', path: '/missing' })).rejects.toBeInstanceOf(SeoStorageError)
    await expect(store.observe({ site: 'en', path: '/%2e%2e/private' })).rejects.toThrow()
  })
})
