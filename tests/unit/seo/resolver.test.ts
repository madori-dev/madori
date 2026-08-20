import { describe, expect, it } from 'vitest'
import { MadoriUrlResolver } from '@/lib/routing'
import { SeoResolver } from '@/lib/seo/resolver'
import { createSiteContext } from '@/lib/sites'

const resolver = new SeoResolver()
const urls = new MadoriUrlResolver()
const en = createSiteContext({ handle: 'en', url: 'https://example.test', locale: 'en-GB', default: true })
const fr = createSiteContext({ handle: 'fr', url: 'https://example.test/fr', locale: 'fr-FR' })

describe('SeoResolver', () => {
  it('cascades sources deterministically and reports provenance', () => {
    const result = resolver.resolve({
      subject: { type: 'entry', id: 'welcome', title: 'Welcome', path: '/welcome' },
      site: en,
      urlResolver: urls,
      system: { title: 'Welcome' },
      siteDefaults: { titleSuffix: 'Madori', description: 'Site description', robots: ['index', 'follow'] },
      sectionDefaults: { titleTemplate: '{title} | Journal', description: 'Collection description' },
      record: { seo: { title: 'A better welcome', description: null } },
    })

    expect(result).toMatchObject({
      excluded: false,
      title: 'A better welcome | Journal | Madori',
      description: 'Collection description',
      canonical: 'https://example.test/welcome',
      robots: { indexing: 'index', following: 'follow' },
    })
    expect(result.provenance).toMatchObject({ title: 'record', titleTemplate: 'scope', titleSuffix: 'site', description: 'scope', robots: 'site', canonical: 'generated' })
  })

  it('excludes scopes or records wholly, including metadata and sitemap', () => {
    const result = resolver.resolve({
      subject: { type: 'entry', id: 'private', title: 'Private', path: '/private' },
      site: en,
      urlResolver: urls,
      sectionDefaults: { enabled: false, description: 'ignored' },
    })

    expect(result).toMatchObject({ excluded: true, metadata: null, sitemap: { enabled: false }, jsonLd: { enabled: false } })
    expect(result.provenance.exclusion).toBe('scope')
  })

  it('suppresses one channel without excluding page', () => {
    const result = resolver.resolve({
      subject: { type: 'entry', id: 'private', title: 'Private', path: '/private' },
      site: en,
      urlResolver: urls,
      system: { title: 'Private' },
      siteDefaults: { social: { image: 'assets::defaults/social.jpg' } },
      record: { seo: { social: { enabled: false } } },
    })

    expect(result).toMatchObject({ excluded: false, title: 'Private', social: null })
    expect(result.provenance.social).toBe('record:suppressed')
  })

  it('reads legacy SEO fields only below nested SEO and retains field provenance', () => {
    const result = resolver.resolve({
      subject: { type: 'entry', id: 'legacy', title: 'Fallback', path: '/legacy' },
      site: en,
      urlResolver: urls,
      system: { title: 'Fallback' },
      record: {
        meta_title: 'Legacy title',
        meta_description: 'Legacy description',
        og_image: 'assets::legacy.jpg',
        seo: { title: { kind: 'literal', value: 'Nested wins' } },
      },
    })

    expect(result).toMatchObject({ title: 'Nested wins', description: 'Legacy description', social: { image: 'assets::legacy.jpg' } })
    expect(result.provenance).toMatchObject({ title: 'record', description: 'record', social: 'record' })
  })

  it('resolves localized alternates and pagination from one canonical URL source', () => {
    const result = resolver.resolve({
      subject: { type: 'archive', id: 'journal', title: 'Journal', path: '/journal' },
      site: en,
      sites: [en, fr],
      localizedPaths: { en: '/journal', fr: '/articles' },
      urlResolver: urls,
      system: { title: 'Journal' },
      page: 3,
      pageCount: 5,
    })

    expect(result.canonical).toBe('https://example.test/journal?page=3')
    expect(result.alternates).toEqual({
      'en-GB': 'https://example.test/journal?page=3',
      'fr-FR': 'https://example.test/fr/articles?page=3',
      'x-default': 'https://example.test/journal?page=3',
    })
    expect(result.previous).toBe('https://example.test/journal?page=2')
    expect(result.next).toBe('https://example.test/journal?page=4')
  })

  it('does not invent hreflang translations that are not published', () => {
    const result = resolver.resolve({
      subject: { type: 'entry', id: 'welcome', title: 'Welcome', path: '/welcome' },
      site: en,
      sites: [en, fr],
      urlResolver: urls,
      system: { title: 'Welcome' },
    })

    expect(result.alternates).toEqual({
      'en-GB': 'https://example.test/welcome',
      'x-default': 'https://example.test/welcome',
    })
  })

  it('treats empty, null, and omitted values as inheritance instead of destructive overrides', () => {
    const result = resolver.resolve({
      subject: { type: 'page', id: 'about', title: 'About', path: '/about' },
      site: en,
      urlResolver: urls,
      system: { title: 'About', description: 'System description' },
      siteDefaults: { description: 'Site description' },
      record: { seo: { description: '' } },
    })

    expect(result.description).toBe('Site description')
    expect(result.provenance.description).toBe('site')
  })

  it('suppresses individual sources and rejects external canonicals by default', () => {
    const input = {
      subject: { type: 'page' as const, id: 'about', title: 'About', path: '/about' },
      site: en,
      urlResolver: urls,
      system: { title: 'About', canonical: 'https://system.test/about' },
      record: { seo: { title: { kind: 'disabled' as const }, canonical: 'https://elsewhere.test/about' } },
    }

    expect(resolver.resolve(input)).toMatchObject({ title: undefined, canonical: 'https://example.test/about' })
    expect(resolver.resolve({ ...input, allowedCanonicalOrigins: ['https://elsewhere.test'] }).canonical)
      .toBe('https://elsewhere.test/about')
  })

  it('sanitises allowed canonicals and refuses embedded credentials', () => {
    const base = {
      subject: { type: 'page' as const, id: 'about', title: 'About', path: '/about' },
      site: en,
      urlResolver: urls,
      system: { title: 'About' },
    }

    expect(resolver.resolve({
      ...base,
      record: { seo: { canonical: 'https://example.test//about?utm_source=test&view=print#fragment' } },
    }).canonical).toBe('https://example.test/about?view=print')

    expect(resolver.resolve({
      ...base,
      record: { seo: { canonical: 'https://user:secret@example.test/private' } },
    }).canonical).toBe('https://example.test/about')
  })
})
