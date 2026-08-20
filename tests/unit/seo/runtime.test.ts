import { describe, expect, it } from 'vitest'
import { MadoriUrlResolver } from '@/lib/routing'
import { SeoRuntime } from '@/lib/seo/runtime'
import { createSiteContext } from '@/lib/sites'

const site = createSiteContext({ handle: 'en', url: 'https://example.test', locale: 'en-GB', default: true })

function runtime(features?: { enabled?: boolean; metadata?: boolean; structuredData?: boolean; socialImages?: boolean }, publicUrl: (reference: string) => string = reference => `https://cdn.example.test/${reference}`) {
  let entryCalls = 0
  const result = new SeoRuntime({
    sites: [site],
    urlResolver: new MadoriUrlResolver(),
    systemDefaults: { title: { kind: 'field', value: 'title' } },
    defaults: {
      async getSite() { return { document: { seo: { title: { kind: 'template', value: '{title}' } } } } },
      async getSection() { return null },
    },
    content: {
      async getPublishedEntry(collection, slug) {
        entryCalls += 1
        return collection === 'posts' && slug === 'launch'
          ? { collection, slug, title: 'Launch', data: { seo: { description: 'Published content', social: { image: 'cover.jpg' } } }, createdAt: '2026-08-19T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' }
          : null
      },
      async listPublishedEntries() {
        return [
          { collection: 'posts', slug: 'launch', title: 'Launch', data: { seo: { social: { image: 'cover.jpg' } } }, updatedAt: '2026-08-20T00:00:00Z' },
        ]
      },
      async getPublishedTerm() { return null },
      async listPublishedTerms(taxonomy) {
        return taxonomy === 'topics'
          ? [{ taxonomy, slug: 'releases', title: 'Releases', data: {} }]
          : []
      },
      async listCollections() { return [{ handle: 'posts', route: '/journal/{slug}' }] },
      async listTaxonomies() { return [{ handle: 'topics', route: '/topics/{slug}' }] },
    },
    assets: { publicUrl },
    features,
  })
  return { result, entryCalls: () => entryCalls }
}

describe('SeoRuntime', () => {
  it('honours SEO output feature gates and canonical policy', async () => {
    const { result } = runtime({ enabled: true, metadata: false, structuredData: false, socialImages: false })
    const output = await result.resolveEntry({ site: 'en', collection: 'posts', slug: 'launch' })
    expect(output?.metadata).toBeNull()
    expect(output?.jsonLd).toBeNull()
    expect(output?.resolved.social?.image).toBeUndefined()

    const disabled = runtime({ enabled: false }).result
    expect((await disabled.resolveEntry({ site: 'en', collection: 'posts', slug: 'launch' }))?.resolved.excluded).toBe(true)
  })

  it('adds localized page suffix and filters alternates to published sites', async () => {
    const output = await runtime({ enabled: true }).result.resolveSite({ site: 'en', path: '/journal', title: 'Journal' })
    expect(output.resolved.title).toBe('Journal')
    const resolverOutput = runtime({ enabled: true }).result
    const page = await resolverOutput.resolveEntry({ site: 'en', collection: 'posts', slug: 'launch', publishedSites: ['en'] })
    expect(page?.resolved.alternates).toEqual({ 'en-GB': 'https://example.test/journal/launch', 'x-default': 'https://example.test/journal/launch' })
  })

  it('resolves public entries through shared cascade and caches by dependencies', async () => {
    const { result, entryCalls } = runtime()
    const first = await result.resolveEntry({ site: 'en', collection: 'posts', slug: 'launch' })
    const second = await result.resolveEntry({ site: 'en', collection: 'posts', slug: 'launch' })

    expect(first?.view).toMatchObject({ canonical: 'https://example.test/journal/launch', title: 'Launch', description: 'Published content' })
    expect(first?.metadata?.openGraph.images).toEqual([{ url: 'https://cdn.example.test/cover.jpg' }])
    expect(first?.dependencies).toMatchObject({ sites: ['en'], sections: ['collection:posts'], records: ['collection:posts:launch'], assets: ['cover.jpg'] })
    expect(second?.view.canonical).toBe(first?.view.canonical)
    expect(entryCalls()).toBe(1)

    expect(result.invalidate({ records: ['collection:posts:launch'] })).toBe(1)
    await result.resolveEntry({ site: 'en', collection: 'posts', slug: 'launch' })
    expect(entryCalls()).toBe(2)
    expect(result.invalidate({ sites: ['*'] })).toBe(1)
  })

  it('emits sitemap URLs only from public port and honours resolved sitemap output', async () => {
    const { result } = runtime()
    const sitemap = await result.sitemap('en')

    expect(sitemap.urls).toEqual([
      expect.objectContaining({
        url: 'https://example.test/journal/launch',
        lastModified: '2026-08-20T00:00:00Z',
        images: [{ url: 'https://cdn.example.test/cover.jpg' }],
      }),
      expect.objectContaining({ url: 'https://example.test/topics/releases' }),
    ])
    expect(result.invalidate({ assets: ['cover.jpg'] })).toBe(1)
  })

  it('never emits credential-bearing asset URLs in metadata or sitemaps', async () => {
    const { result } = runtime(undefined, () => 'https://user:secret@cdn.example.test/cover.jpg')
    const entry = await result.resolveEntry({ site: 'en', collection: 'posts', slug: 'launch' })
    const sitemap = await result.sitemap('en')

    expect(entry?.socialImage).toBeUndefined()
    expect(entry?.metadata?.openGraph.images).toBeUndefined()
    expect(sitemap.urls[0]?.images).toBeUndefined()
  })

  it('allows explain output only through authenticated adapters', async () => {
    const { result } = runtime()
    await expect(result.previewEntry({ site: 'en', collection: 'posts', slug: 'launch' }, { isAuthenticated: () => false }))
      .rejects.toThrow('SEO preview requires an authenticated adapter.')
    const preview = await result.previewEntry({ site: 'en', collection: 'posts', slug: 'launch' }, { isAuthenticated: () => true })
    expect(preview?.provenance.title).toBe('site')
  })

  it('builds generated robots and humans documents from site identity', async () => {
    const { result } = runtime()
    expect(await result.robots('en')).toMatchObject({ sitemapUrls: ['https://example.test/sitemap.xml'], host: 'https://example.test' })
    expect(await result.humans('en', { team: ['Madori'] })).toEqual({ team: ['Madori'], site: ['https://example.test'] })
    expect(await result.robotsTxt('en')).toContain('Sitemap: https://example.test/sitemap.xml')
    expect(await result.humansTxt('en', { team: ['Madori'] })).toContain('/* TEAM */')
    expect(await result.sitemapXml('en')).toContain('<loc>https://example.test/journal/launch</loc>')
  })
})
