import { describe, expect, it } from 'vitest'
import { MadoriConfigSchema, SeoConfigSchema } from '@/lib/config/schema'
import { resolveConfigPaths } from '@/lib/config/loader'

describe('SEO configuration', () => {
  it('provides one local default site and safe feature defaults', () => {
    const config = MadoriConfigSchema.parse({})

    expect(config.sites).toEqual([{
      handle: 'default',
      url: 'http://localhost:3000',
      locale: 'en-US',
      default: true,
    }])
    expect(config.seo).toEqual({
      enabled: true,
      metadata: true,
      structuredData: true,
      sitemap: true,
      robots: true,
      humans: true,
      reports: true,
      redirects: true,
      errorTracking: false,
      socialImages: false,
      allowExternalCanonicals: false,
      allowedRedirectOrigins: [],
      trailingSlash: 'never',
      reportRetentionDays: 90,
      reportSnapshotLimit: 50,
      operationalStoragePath: './storage/seo',
    })
  })

  it('accepts multi-site origins and explicit opt-in features', () => {
    const config = MadoriConfigSchema.parse({
      sites: [
        { handle: 'en', url: 'https://example.com/docs', locale: 'en-GB', default: true },
        { handle: 'fr', url: 'https://example.fr', locale: 'fr-FR' },
      ],
      seo: { errorTracking: true, socialImages: true, trailingSlash: 'always' },
    })

    expect(config.sites[1]).toMatchObject({ handle: 'fr', default: false })
    expect(config.seo).toMatchObject({
      errorTracking: true,
      socialImages: true,
      trailingSlash: 'always',
    })
  })

  it('rejects ambiguous or duplicate site definitions', () => {
    expect(MadoriConfigSchema.safeParse({
      sites: [{ handle: 'en', url: 'https://example.com', locale: 'en-GB' }],
    }).success).toBe(false)

    expect(MadoriConfigSchema.safeParse({
      sites: [
        { handle: 'en', url: 'https://example.com', locale: 'en-GB', default: true },
        { handle: 'en', url: 'https://example.org', locale: 'en-US' },
      ],
    }).success).toBe(false)

    expect(MadoriConfigSchema.safeParse({
      sites: [
        { handle: 'en', url: 'https://example.com', locale: 'en-GB', default: true },
        { handle: 'fr', url: 'https://example.fr', locale: 'fr-FR', default: true },
      ],
    }).success).toBe(false)
  })

  it('rejects invalid public origins and operational paths', () => {
    expect(MadoriConfigSchema.safeParse({
      sites: [{ handle: 'default', url: 'not-a-url', locale: 'en-GB', default: true }],
    }).success).toBe(false)
    expect(MadoriConfigSchema.safeParse({
      sites: [{ handle: 'default', url: 'ftp://example.com', locale: 'en-GB', default: true }],
    }).success).toBe(false)
    expect(MadoriConfigSchema.safeParse({
      sites: [{ handle: 'default', url: 'https://user:secret@example.com?q=1', locale: 'en-GB', default: true }],
    }).success).toBe(false)
    expect(MadoriConfigSchema.safeParse({
      sites: [{ handle: 'default', url: 'https://example.com', locale: 'not a locale', default: true }],
    }).success).toBe(false)
    expect(SeoConfigSchema.safeParse({ operationalStoragePath: 'bad\0path' }).success).toBe(false)
    expect(SeoConfigSchema.safeParse({ allowedRedirectOrigins: ['https://user:secret@example.com'] }).success).toBe(false)
    expect(SeoConfigSchema.safeParse({ allowedRedirectOrigins: ['https://example.com/path'] }).success).toBe(false)
    expect(SeoConfigSchema.parse({ allowedRedirectOrigins: ['https://redirects.example.com'] }).allowedRedirectOrigins).toEqual(['https://redirects.example.com'])
  })

  it('resolves operational SEO storage outside Git-authored content', () => {
    const config = resolveConfigPaths(MadoriConfigSchema.parse({
      seo: { operationalStoragePath: './var/seo' },
    }), '/srv/site')

    expect(config.seo.operationalStoragePath).toBe('/srv/site/var/seo')
  })
})
