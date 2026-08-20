import { describe, expect, it } from 'vitest'
import { resolveConfiguredSite } from '@/lib/seo/next/site'
import { createSiteContexts } from '@/lib/sites'

const sites = createSiteContexts([
  { handle: 'en', url: 'https://example.test', locale: 'en-GB', default: true },
  { handle: 'fr', url: 'https://example.test/fr', locale: 'fr-FR' },
  { handle: 'preview', url: 'http://localhost:3000', locale: 'en-US' },
])

describe('public SEO request-site resolution', () => {
  it('selects only a configured origin from Host', () => {
    expect(resolveConfiguredSite(sites, 'localhost:3000').handle).toBe('preview')
    expect(resolveConfiguredSite(sites, 'EXAMPLE.TEST').handle).toBe('en')
  })

  it('falls back to configured default instead of reflecting untrusted hosts', () => {
    expect(resolveConfiguredSite(sites, 'attacker.example').handle).toBe('en')
    expect(resolveConfiguredSite(sites, 'attacker.example/path').handle).toBe('en')
    expect(resolveConfiguredSite(sites, null).handle).toBe('en')
  })

  it('accepts explicit default ports without changing configured URL identity', () => {
    expect(resolveConfiguredSite(sites, 'example.test:443')).toMatchObject({
      handle: 'en',
      baseUrl: 'https://example.test',
    })
  })

  it('chooses longest configured base path for same-host sites', () => {
    expect(resolveConfiguredSite(sites, 'example.test', '/fr/docs')).toMatchObject({
      handle: 'fr',
      basePath: '/fr',
    })
  })
})
