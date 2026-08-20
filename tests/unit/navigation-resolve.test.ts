import { describe, expect, it } from 'vitest'

import { resolveNavigationItems } from '@/lib/navigation/resolve'
import { MadoriUrlResolver } from '@/lib/routing/url-resolver'

const site = { handle: 'default', origin: 'https://example.test', basePath: '/site', locale: 'en', trailingSlash: 'never' as const }
const content = { getEntry: async (collection: string, slug: string) => ({ title: slug, slug, status: 'published' as const, content: '', data: {}, collection, createdAt: '', updatedAt: '' }) }
const urlResolver = new MadoriUrlResolver()

describe('resolveNavigationItems', () => {
  it('uses configured public route for entry references at every tree level', async () => {
    const items = await resolveNavigationItems([{ label: 'Docs', children: [{ label: 'Guide', entry: 'docs/getting-started' }] }], {
      collections: [{ handle: 'docs', title: 'Docs', blueprint: 'docs', route: '/learn/{slug}' }], content, urlResolver, site,
    })

    expect(items[0].children?.[0].url).toBe('/site/learn/getting-started')
  })

  it('keeps explicit URLs and leaves malformed references unresolved', async () => {
    const items = await resolveNavigationItems([
      { label: 'External', url: 'https://example.test', entry: 'docs/ignored' },
      { label: 'Bad', entry: 'docs' },
    ], { collections: [{ handle: 'docs', title: 'Docs', blueprint: 'docs' }], content, urlResolver, site })

    expect(items[0].url).toBe('https://example.test')
    expect(items[1].url).toBeUndefined()
  })

  it('uses parent_uri semantics without producing double slashes', async () => {
    const items = await resolveNavigationItems([{ label: 'Child', entry: 'docs/guides/installation' }], {
      collections: [{ handle: 'docs', title: 'Docs', blueprint: 'docs', route: '/docs/{parent_uri}/{slug}' }], content, urlResolver, site,
    })
    expect(items[0].url).toBe('/site/docs/guides/installation')
  })
})
