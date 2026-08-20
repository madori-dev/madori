import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const fixtureRoot = path.join(process.cwd(), 'tests/fixtures/seo')
const read = <T>(name: string): T => JSON.parse(readFileSync(path.join(fixtureRoot, name), 'utf8')) as T

interface Manifest { version: number; fixtureSchema: string; requiredCapabilities: string[]; fixtureFiles: string[]; parityAcceptance: string[]; beyondParityAcceptance: string[] }
interface CascadeCase { id: string; layers: Record<string, Record<string, unknown>>; expected: Record<string, unknown> }

describe('SEO Wave 0 parity manifest', () => {
  it('is versioned and references every machine-readable fixture', () => {
    const manifest = read<Manifest>('parity-manifest.json')
    expect(manifest.version).toBe(1)
    expect(manifest.fixtureSchema).toBe('madori.seo.parity.v1')
    expect(manifest.requiredCapabilities).toHaveLength(19)
    for (const file of manifest.fixtureFiles) expect(() => read(file)).not.toThrow()
    expect(manifest.parityAcceptance.length).toBeGreaterThanOrEqual(8)
    expect(manifest.beyondParityAcceptance.length).toBeGreaterThanOrEqual(4)
  })

  it('freezes dedicated versioned storage without changing collection or taxonomy definitions', () => {
    const fixture = read<{ version: number; gitVersioned: Record<string, { path: string }>; operational: string[] }>('storage-and-defaults.json')
    expect(fixture.version).toBe(1)
    expect(fixture.gitVersioned.site.path).toBe('resources/seo/sites/en.yaml')
    expect(fixture.gitVersioned.collection.path).toBe('resources/seo/sections/collection/journal.yaml')
    expect(fixture.gitVersioned.taxonomy.path).toBe('resources/seo/sections/taxonomy/topics.yaml')
    expect(fixture.gitVersioned.redirect.path).toBe('content/seo/redirects/redirect-1.yaml')
    expect(fixture.operational.every(value => value.startsWith('storage/seo/'))).toBe(true)
  })

  it('freezes precedence and explicit disabled semantics', () => {
    const fixture = read<{ precedence: string[]; semantics: Record<string, string>; cases: CascadeCase[] }>('cascade.json')
    expect(fixture.precedence).toEqual(['system', 'site', 'scope', 'record'])
    expect(fixture.semantics).toEqual({
      omitted: 'inherit', null: 'inherit', emptyString: 'unset',
      disabledScopeOrRecord: 'exclude-subject', disabledChannel: 'suppress-channel',
    })
    expect(fixture.cases.find(item => item.id === 'entry-full-cascade')?.expected).toMatchObject({ description: 'Collection description' })
    expect(fixture.cases.find(item => item.id === 'disabled-scope-excludes-subject')?.expected).toEqual({ excluded: true, metadata: null, report: false, sitemap: false, sources: { exclusion: 'scope' } })
    expect(fixture.cases.find(item => item.id === 'record-disables-social-channel')?.expected).toMatchObject({ social: null })
  })

  it('covers domain, subdirectory, and paginated canonical contracts', () => {
    const fixture = read<{ cases: Array<{ id: string; expected: Record<string, unknown> }> }>('locales-and-pagination.json')
    expect(fixture.cases.map(item => item.id)).toEqual(['domain-locales', 'subdirectory-locales', 'paginated-archive'])
    expect(fixture.cases[0].expected).toMatchObject({ canonical: 'https://example.com/journal' })
    expect(fixture.cases[1].expected).toMatchObject({ canonical: 'https://example.com/fr/articles' })
    expect(fixture.cases[2].expected).toMatchObject({ canonical: 'https://example.com/journal?page=3', previous: 'https://example.com/journal?page=2', next: 'https://example.com/journal?page=4' })
  })

  it('covers social fallback, JSON-LD, redirects, and operational 404 storage', () => {
    const structured = read<{ cases: Array<{ id: string; expected: Record<string, unknown> }> }>('social-and-jsonld.json')
    const operations = read<{ redirects: Array<{ expected: string }>; notFoundObservations: Array<{ opaqueId: string; storage: string }> }>('redirects-and-404.json')
    expect(structured.cases.find(item => item.id === 'site-image-fallback')?.expected).toMatchObject({ openGraph: { image: 'assets::defaults/social.jpg' } })
    expect(structured.cases.find(item => item.id === 'structured-data-disabled')?.expected).toEqual({ jsonLd: [] })
    expect(operations.redirects.filter(item => item.expected.startsWith('rejected:'))).toHaveLength(2)
    expect(operations.notFoundObservations.every(item => item.storage === 'operational' && item.opaqueId.startsWith('nf_'))).toBe(true)
  })

  it('freezes API envelopes, least-privilege permissions, and migration compatibility', () => {
    const api = read<{ responses: Record<string, Record<string, unknown>> }>('api-contracts.json')
    const permissions = read<{ permissions: string[]; roles: Record<string, Record<string, boolean>>; rule: string }>('permissions.json')
    const migration = read<{ legacy: Record<string, string>; target: { seo: Record<string, unknown> }; precedenceDuringMigration: string[]; requirements: string[] }>('migration.json')
    expect(api.responses.resolved).toHaveProperty('data')
    expect(api.responses.resolved).toHaveProperty('meta')
    expect(api.responses.error).toHaveProperty('error')
    expect(permissions.permissions).toEqual(['view seo reports', 'edit seo defaults', 'manage seo redirects'])
    expect(permissions.roles['editor-without-entry-access'].editRecordSeo).toBe(false)
    expect(migration.target.seo).toMatchObject({ title: migration.legacy.meta_title, description: migration.legacy.meta_description })
    expect(migration.precedenceDuringMigration).toEqual(['legacy-top-level', 'nested-seo'])
    expect(migration.requirements).toContain('Git-visible-content-change')
  })
})
