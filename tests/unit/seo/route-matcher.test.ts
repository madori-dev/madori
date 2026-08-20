import { describe, expect, it } from 'vitest'
import { matchPublicContentRoutes } from '@/lib/routing'

describe('public content route matching', () => {
  it('inverts configured collection and taxonomy route templates', () => {
    expect(matchPublicContentRoutes(
      '/journal/launch',
      [{ handle: 'posts', route: '/journal/{slug}' }],
      [],
    )[0]).toEqual({ kind: 'collection', handle: 'posts', slug: 'launch', route: '/journal/{slug}' })

    expect(matchPublicContentRoutes(
      '/topics/news',
      [],
      [{ handle: 'topics', route: '/topics/{slug}' }],
    )[0]).toEqual({ kind: 'taxonomy', handle: 'topics', slug: 'news', route: '/topics/{slug}' })
  })

  it('supports handle tokens, structured parents, and inline slug tokens', () => {
    expect(matchPublicContentRoutes(
      '/posts/guides/install.html',
      [{ handle: 'posts', route: '/{collection}/{parent_uri}/{slug}.html' }],
      [],
    )[0]).toMatchObject({ kind: 'collection', handle: 'posts', slug: 'install' })

    expect(matchPublicContentRoutes(
      '/topics/releases',
      [],
      [{ handle: 'topics' }],
    )[0]).toMatchObject({ kind: 'taxonomy', handle: 'topics', slug: 'releases' })
  })

  it('orders specific routes before the default pages catch-all', () => {
    const matches = matchPublicContentRoutes(
      '/journal/launch',
      [{ handle: 'pages' }, { handle: 'posts', route: '/journal/{slug}' }],
      [],
    )

    expect(matches.map(match => match.handle)).toEqual(['posts'])
  })

  it('returns no match for unsafe paths or mismatched fixed handles', () => {
    expect(matchPublicContentRoutes('/topics/%2Fprivate', [], [{ handle: 'topics' }])).toEqual([])
    expect(matchPublicContentRoutes('/other/news', [], [{ handle: 'topics' }])).toEqual([])
    expect(matchPublicContentRoutes('/../private', [{ handle: 'pages' }], [])).toEqual([])
  })
})
