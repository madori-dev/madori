import { describe, expect, it, vi } from 'vitest'
import { SeoAuditEngine } from '@/lib/seo/audit/engine'
import { SeoAuditRunner } from '@/lib/seo/audit/runner'

const site = { handle: 'main', url: 'https://example.test', baseUrl: 'https://example.test', basePath: '', locale: 'en-GB', isDefault: true }

describe('SeoAuditRunner', () => {
  it('audits only published entries and terms, then persists the report', async () => {
    const save = vi.fn(async () => ({ id: 'snapshot', createdAt: '2026-08-19T12:00:00.000Z', report: {} }))
    const resolveEntry = vi.fn(async () => result('Entry title long enough', 'Useful entry description with enough detail for search results.'))
    const resolveTerm = vi.fn(async () => result('Term title long enough', 'Useful term description with enough detail for search results.'))
    const runner = new SeoAuditRunner({
      content: {
        listCollections: async () => [{ handle: 'articles' }],
        listTaxonomies: async () => [{ handle: 'topics' }],
        listPublishedEntries: async () => [{ collection: 'articles', slug: 'welcome', title: 'Welcome', data: { content: '[Term](/topics/news)' } }],
        listPublishedTerms: async () => [{ taxonomy: 'topics', slug: 'news', title: 'News', data: {} }],
        getPublishedEntry: async () => null,
        getPublishedTerm: async () => null,
      },
      runtime: { resolveEntry, resolveTerm } as never,
      redirects: { list: async () => [{ redirect: { id: 'old', site: 'main', source: '/old', destination: '/new', status: 301, enabled: true } }] },
      engine: new SeoAuditEngine(),
      snapshots: { save, list: async () => [] },
      sites: [site],
    })

    const output = await runner.run({ now: new Date('2026-08-19T12:00:00.000Z') })

    expect(resolveEntry).toHaveBeenCalledWith({ site, collection: 'articles', slug: 'welcome' })
    expect(resolveTerm).toHaveBeenCalledWith({ site, taxonomy: 'topics', slug: 'news' })
    expect(output.pages).toBe(2)
    expect(output.redirects).toBe(1)
    expect(output.report.issues.every(issue => issue.subject.id.startsWith('main:'))).toBe(true)
    expect(save).toHaveBeenCalledWith(output.report)
    expect(output.report.issues.every(issue => issue.subject.site === 'main')).toBe(true)
  })

  it('rejects an unknown site instead of silently auditing every site', async () => {
    const runner = new SeoAuditRunner({
      content: {} as never,
      runtime: {} as never,
      redirects: {} as never,
      engine: new SeoAuditEngine(),
      snapshots: {} as never,
      sites: [site],
    })
    await expect(runner.run({ site: 'unknown' })).rejects.toThrow('Unknown SEO site: unknown')
  })
})

function result(title: string, description: string) {
  return {
    view: { title, description, canonical: `https://example.test/${title.includes('Term') ? 'topics/news' : 'articles/welcome'}` },
    resolved: {
      excluded: false,
      robots: { indexing: 'index' },
      sitemap: { enabled: true },
      alternates: {},
      provenance: { title: 'record', description: 'record' },
    },
    jsonLd: { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage' }] },
    socialImage: { url: 'https://example.test/social.png', alt: 'Social card' },
    dependencies: { records: ['record'] },
  }
}
