import { graphql } from 'graphql'
import { describe, expect, it, vi } from 'vitest'
import { PermissionGuard } from '@/lib/auth/guard'
import type { PermissionChecker } from '@/lib/auth/permissions'
import { SchemaGeneratorImpl } from '@/lib/graphql/schema-generator'
import { buildResolvers } from '@/lib/graphql/resolvers'
import type { SeoGraphQLPort } from '@/lib/seo/graphql'

function resolved() {
  return {
    excluded: false, title: 'Published title', description: 'Published description', canonical: 'https://example.test/post',
    robots: { indexing: 'index' as const, following: 'follow' as const }, social: null,
    sitemap: { enabled: true }, jsonLd: { enabled: true }, alternates: {}, metadata: { title: 'Published title' }, provenance: {}, explain: [],
  }
}

function port(overrides: Partial<SeoGraphQLPort> = {}): SeoGraphQLPort {
  return {
    getSite: async site => ({ document: { version: 1, kind: 'site', site, seo: {} }, revision: 'revision-1', path: '/private/resources/seo/sites/default.yaml' }),
    getSection: async (section, handle) => ({ document: { version: 1, kind: 'section', section, handle, seo: {} }, revision: 'revision-2', path: '/private/resources/seo/sections/collection/posts.yaml' }),
    resolve: async () => resolved(),
    ...overrides,
  }
}

function schema(seo: SeoGraphQLPort, permitted = true) {
  const checker = { hasPermission: vi.fn(async () => permitted) } as unknown as PermissionChecker
  const guard = new PermissionGuard(checker, { permissions: new Map() })
  return new SchemaGeneratorImpl().generateSchema([], [], buildResolvers([], { guard, seo }))
}

describe('SEO GraphQL', () => {
  it('passes site scope into permission checks', async () => {
    const hasPermission = vi.fn(async () => true)
    const guard = new PermissionGuard({ hasPermission } as unknown as PermissionChecker, { permissions: new Map() })
    const graphqlSchema = new SchemaGeneratorImpl().generateSchema([], [], buildResolvers([], { guard, seo: port() }))

    await graphql({ schema: graphqlSchema, contextValue: { auth: { userId: 'editor', roles: ['editor'] } }, source: '{ seoResolved(site: "site-a", collection: "posts", slug: "published") { title } }' })

    expect(hasPermission).toHaveBeenCalledWith(['editor'], 'seo', 'view', 'site-a')
  })

  it('returns typed public resolved SEO without draft, path, or provenance data', async () => {
    const graphqlSchema = schema(port())
    const result = await graphql({ schema: graphqlSchema, contextValue: { auth: { userId: 'editor', roles: ['editor'] } }, source: `
      query { seoResolved(site: "default", collection: "posts", slug: "published") {
        title canonical indexing sitemapEnabled alternates { locale url }
      } }
    ` })
    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({ seoResolved: { title: 'Published title', canonical: 'https://example.test/post', indexing: 'index', sitemapEnabled: true, alternates: [] } })
    expect(JSON.stringify(result.data)).not.toContain('/private')
    expect(JSON.stringify(result.data)).not.toContain('provenance')
  })

  it('resolves published taxonomy terms through the typed SEO surface', async () => {
    const resolveTerm = vi.fn(async () => resolved())
    const result = await graphql({
      schema: schema(port({ resolveTerm })),
      contextValue: { auth: { userId: 'editor', roles: ['editor'] } },
      source: '{ seoResolvedTerm(site: "default", taxonomy: "topics", slug: "news") { title canonical } }',
    })
    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({ seoResolvedTerm: { title: 'Published title', canonical: 'https://example.test/post' } })
    expect(resolveTerm).toHaveBeenCalledWith({ site: 'default', taxonomy: 'topics', slug: 'news' })
  })

  it('accepts custom JSON-LD through variables and validates it at the domain boundary', async () => {
    const saveSite = vi.fn(async document => ({ document, revision: 'revision-3', path: '/private/site.yaml' }))
    const result = await graphql({
      schema: schema(port({ saveSite })),
      contextValue: { auth: { userId: 'editor', roles: ['editor'] } },
      source: 'mutation Save($document: SeoSiteDocumentInput!) { seoSaveSite(document: $document) { data { seo { jsonLd { type custom } } } } }',
      variableValues: { document: { version: 1, kind: 'site', site: 'default', seo: { jsonLd: { type: 'custom', custom: { '@type': 'FAQPage', mainEntity: [] } } } } },
    })
    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({ seoSaveSite: { data: { seo: { jsonLd: { type: 'custom', custom: { '@type': 'FAQPage', mainEntity: [] } } } } } })
  })

  it('requires SEO permission before invoking resolver port', async () => {
    const seo = port()
    const getSite = vi.spyOn(seo, 'getSite')
    const result = await graphql({ schema: schema(seo, false), contextValue: { auth: { userId: 'viewer', roles: ['viewer'] } }, source: '{ seoSite(site: "default") { data { site } } }' })
    expect(result.data).toEqual({ seoSite: null })
    expect(result.errors?.[0]?.extensions.code).toBe('UNAUTHORIZED')
    expect(getSite).not.toHaveBeenCalled()
  })

  it('does not expose document storage paths in defaults response', async () => {
    const result = await graphql({ schema: schema(port()), contextValue: { auth: { userId: 'editor', roles: ['editor'] } }, source: '{ seoSite(site: "default") { data { site seo { enabled } } meta { revision } } }' })
    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({ seoSite: { data: { site: 'default', seo: { enabled: null } }, meta: { revision: 'revision-1' } } })
    expect(JSON.stringify(result.data)).not.toContain('path')
  })

  it('rejects incomplete mutation input at GraphQL validation before port writes', async () => {
    const saveSite = vi.fn()
    const result = await graphql({ schema: schema(port({ saveSite })), contextValue: { auth: { userId: 'editor', roles: ['editor'] } }, source: `
      mutation { seoSaveSite(document: { kind: "site", site: "default", seo: {} }) { meta { revision } } }
    ` })
    expect(result.data).toBeUndefined()
    expect(result.errors?.[0]?.message).toContain('version')
    expect(saveSite).not.toHaveBeenCalled()
  })

  it('rejects invalid strict SEO source values before port writes', async () => {
    const saveSite = vi.fn()
    const result = await graphql({ schema: schema(port({ saveSite })), contextValue: { auth: { userId: 'editor', roles: ['editor'] } }, source: `
      mutation {
        seoSaveSite(document: { version: 1, kind: "site", site: "default", seo: { title: { kind: "arbitrary", value: "nope" } } }) {
          meta { revision }
        }
      }
    ` })
    expect(result.data).toEqual({ seoSaveSite: null })
    expect(result.errors?.[0]?.extensions.code).toBe('INTERNAL_ERROR')
    expect(saveSite).not.toHaveBeenCalled()
  })
})
