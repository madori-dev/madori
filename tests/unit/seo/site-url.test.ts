import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  createSiteContext,
  createSiteContexts,
  normalizePublicPath,
  SiteContextError,
} from '@/lib/sites'
import { MadoriUrlResolver, UrlResolutionError } from '@/lib/routing'

const primary = createSiteContext({
  handle: 'main',
  url: 'https://example.test',
  locale: 'en-GB',
  default: true,
})

describe('SiteContext', () => {
  it('supports a domain rooted site and a subdirectory locale site', () => {
    const [english, french] = createSiteContexts([
      { handle: 'english', url: 'https://example.test', locale: 'en-GB', default: true },
      { handle: 'french', url: 'https://fr.example.test/fr/', locale: 'fr-FR' },
    ])

    expect(english).toMatchObject({ origin: 'https://example.test', basePath: '', isDefault: true })
    expect(french).toMatchObject({ origin: 'https://fr.example.test', basePath: '/fr', isDefault: false })
  })

  it.each([
    ['javascript URL', { handle: 'main', url: 'javascript:alert(1)', locale: 'en' }],
    ['credentials', { handle: 'main', url: 'https://user:pass@example.test', locale: 'en' }],
    ['query string', { handle: 'main', url: 'https://example.test/?x=1', locale: 'en' }],
    ['fragment', { handle: 'main', url: 'https://example.test/#x', locale: 'en' }],
    ['invalid locale', { handle: 'main', url: 'https://example.test', locale: 'not a locale' }],
  ])('rejects unsafe %s', (_name, definition) => {
    expect(() => createSiteContext(definition)).toThrow(SiteContextError)
  })

  it('selects first site when no default is declared and rejects multiple defaults', () => {
    expect(createSiteContexts([
      { handle: 'one', url: 'https://one.test', locale: 'en' },
      { handle: 'two', url: 'https://two.test', locale: 'fr' },
    ])[0].isDefault).toBe(true)

    expect(() => createSiteContexts([
      { handle: 'one', url: 'https://one.test', locale: 'en', default: true },
      { handle: 'two', url: 'https://two.test', locale: 'fr', default: true },
    ])).toThrow('Only one site')
  })
})

describe('public path normalization', () => {
  it('canonicalizes unicode and collapses redundant slashes', () => {
    expect(normalizePublicPath('/guides//café and tea/')).toBe('/guides/caf%C3%A9%20and%20tea')
    expect(normalizePublicPath('/guides/café', 'always')).toBe('/guides/caf%C3%A9/')
    expect(normalizePublicPath('/guides/café/', 'preserve')).toBe('/guides/caf%C3%A9/')
  })

  it.each([
    '/a/../secret',
    '/a/%2e%2e/secret',
    '/a/%2Fsecret',
    '/a/%5csecret',
    '/a\\secret',
    '/a?query=yes',
    '/a#fragment',
    '/a/%ZZ',
    '/a/\u0000secret',
  ])('rejects unsafe public path %j', (path) => {
    expect(() => normalizePublicPath(path)).toThrow(SiteContextError)
  })

  it('never emits a traversal, control character, query, fragment, or backslash for valid segment lists', () => {
    fc.assert(fc.property(
      fc.array(fc.stringMatching(/^[A-Za-z0-9_-]{1,16}$/), { minLength: 1, maxLength: 6 }),
      (segments) => {
        const result = normalizePublicPath(`/${segments.join('/')}`)
        expect(result).not.toMatch(/\.\.|[?#\\\u0000-\u001F\u007F]/u)
      }
    ))
  })
})

describe('MadoriUrlResolver', () => {
  const resolver = new MadoriUrlResolver()

  it('preserves current default entry routing and supports structured routes', () => {
    expect(resolver.entry({ site: primary, collection: 'pages', slug: 'about' }))
      .toBe('https://example.test/about')
    expect(resolver.entry({
      site: primary,
      collection: 'docs',
      slug: 'installation',
      parentSlugs: ['guides', 'getting-started'],
      route: '/{collection}/{parent_uri}/{slug}',
    })).toBe('https://example.test/docs/guides/getting-started/installation')
  })

  it('resolves taxonomy, pagination, alternates, unicode, domains, and subdirectories consistently', () => {
    const french = createSiteContext({ handle: 'fr', url: 'https://fr.example.test/fr', locale: 'fr-FR' })
    expect(resolver.term({ site: french, taxonomy: 'topics', slug: 'café' }))
      .toBe('https://fr.example.test/fr/topics/caf%C3%A9')
    expect(resolver.pagination({ site: french, path: '/articles', page: 1 })).toBe('https://fr.example.test/fr/articles')
    expect(resolver.pagination({ site: french, path: '/articles', page: 2 })).toBe('https://fr.example.test/fr/articles?page=2')
    expect(resolver.alternates([primary, french], '/about')).toEqual({
      'en-GB': 'https://example.test/about',
      'fr-FR': 'https://fr.example.test/fr/about',
    })
  })

  it.each([
    () => resolver.entry({ site: primary, collection: '../pages', slug: 'home' }),
    () => resolver.entry({ site: primary, collection: 'pages', slug: '../private' }),
    () => resolver.entry({ site: primary, collection: 'pages', slug: 'a%2Fb' }),
    () => resolver.entry({ site: primary, collection: 'pages', slug: 'home', route: 'https://evil.test/{slug}' }),
    () => resolver.term({ site: primary, taxonomy: 'topics', slug: 'one', route: '/{unknown}' }),
    () => resolver.pagination({ site: primary, path: '/articles', page: 0 }),
    () => resolver.pagination({ site: primary, path: '/articles', page: 2, parameter: 'page&evil' }),
  ])('rejects unsafe resolver input', (call) => {
    expect(call).toThrow(UrlResolutionError)
  })
})
