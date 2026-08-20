import { describe, expect, it } from 'vitest'
import {
  generateHumansTxt,
  generateJsonLd,
  generateMetadata,
  generateRobotsTxt,
  generateSitemapXml,
  serializeJsonLd,
} from '@/lib/seo/outputs'
import socialFixture from '../../fixtures/seo/social-and-jsonld.json'

const article = {
  canonical: 'https://example.com/journal/launch',
  title: 'Launch notes',
  description: 'What changed',
  siteName: 'Example',
  locale: 'en_GB',
  pageType: 'article' as const,
  social: { image: 'https://cdn.example.com/launch.jpg', imageAlt: 'Launch', twitterSite: '@example' },
  article: { author: 'Madori Team', publishedAt: '2026-08-19T09:00:00Z' },
  organization: { name: 'Madori', url: 'https://example.com', logo: 'https://cdn.example.com/logo.png' },
  breadcrumbs: [
    { name: 'Journal', url: 'https://example.com/journal' },
    { name: 'Launch notes', url: 'https://example.com/journal/launch' },
  ],
}

describe('SEO output generators', () => {
  it('emits a Next-compatible metadata descriptor from resolved values', () => {
    expect(generateMetadata(article)).toMatchObject({
      title: 'Launch notes',
      alternates: { canonical: article.canonical },
      openGraph: { type: 'article', images: [{ url: article.social.image }] },
      twitter: { card: 'summary_large_image', images: [article.social.image] },
    })
  })

  it('honours social-and-schema parity fixture once asset references are resolved', () => {
    const fixture = socialFixture.cases.find((item) => item.id === 'article-social-and-schema')!
    const expected = fixture.expected as { openGraph: { type: string; title: string }; twitter: { card: string } }
    const output = generateMetadata({
      canonical: fixture.input.canonical!,
      title: fixture.input.title!,
      description: fixture.input.description,
      pageType: 'article',
      social: { image: 'https://cdn.example.com/journal/launch.jpg' },
    })
    expect(output.openGraph).toMatchObject({ type: expected.openGraph.type, title: expected.openGraph.title })
    expect(output.twitter.card).toBe(expected.twitter.card)
  })

  it('omits untrusted social URLs and rejects invalid canonicals', () => {
    expect(generateMetadata({ ...article, social: { image: 'javascript:alert(1)' } }).openGraph.images).toBeUndefined()
    expect(generateMetadata({ ...article, social: { image: 'https://user:secret@cdn.example.com/launch.jpg' } }).openGraph.images).toBeUndefined()
    expect(() => generateMetadata({ ...article, canonical: '/relative' })).toThrow('canonical must be an absolute HTTP(S) URL')
  })

  it('creates stable, connected Schema.org graph and script-safe serialisation', () => {
    const graph = generateJsonLd({ ...article, title: '</script><script>alert(1)</script>' })
    expect(graph['@graph'].map((node) => node['@type'])).toEqual(['WebSite', 'Organization', 'Article', 'BreadcrumbList'])
    expect(graph['@graph'][2]).toMatchObject({ '@id': 'https://example.com/journal/launch#webpage', isPartOf: { '@id': 'https://example.com/journal/launch#website' } })
    expect(serializeJsonLd(graph)).not.toContain('</script>')
  })

  it('emits bounded data-only custom JSON-LD nodes without replacing the base graph', () => {
    const graph = generateJsonLd({
      ...article,
      jsonLd: { type: 'custom', custom: { '@type': 'FAQPage', name: 'Questions', mainEntity: [] } },
    })
    expect(graph['@graph']).toContainEqual({ '@type': 'FAQPage', name: 'Questions', mainEntity: [] })
    expect(graph['@graph']).toContainEqual(expect.objectContaining({ '@type': 'Article' }))
  })

  it('escapes XML while including hreflang and images', () => {
    const sitemap = generateSitemapXml({
      urls: [{
        url: article.canonical,
        alternates: { en: article.canonical, 'x-default': article.canonical },
        images: [{ url: article.social.image, title: 'Launch & learn' }],
        priority: 0.8,
      }],
    })
    expect(sitemap).toContain('xmlns:xhtml=')
    expect(sitemap).toContain('xmlns:image=')
    expect(sitemap).toContain('hreflang="x-default"')
    expect(sitemap).toContain('Launch &amp; learn')
  })

  it('does not expose credential-bearing URLs in XML or JSON-LD', () => {
    const sitemap = generateSitemapXml({ urls: [{ url: 'https://user:secret@example.com/private' }] })
    expect(sitemap).not.toContain('secret')
    const graph = generateJsonLd({ ...article, social: { image: 'https://user:secret@cdn.example.com/image.jpg' } })
    expect(graph['@graph'][2]?.image).toBeUndefined()
  })

  it('prefers a sitemap index when shard URLs are supplied', () => {
    const sitemap = generateSitemapXml({ sitemaps: [{ url: 'https://example.com/sitemaps/journal.xml' }] })
    expect(sitemap).toContain('<sitemapindex')
    expect(sitemap).toContain('<loc>https://example.com/sitemaps/journal.xml</loc>')
  })

  it('generates sane robots and humans text without unsafe sitemap URLs', () => {
    expect(generateRobotsTxt({ sitemapUrls: ['https://example.com/sitemap.xml', 'file:///etc/passwd'] })).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://example.com/sitemap.xml\n',
    )
    expect(generateHumansTxt({ team: ['Madori'], site: ['https://example.com'] })).toBe(
      '/* TEAM */\nMadori\n\n/* SITE */\nhttps://example.com\n',
    )
  })
})
