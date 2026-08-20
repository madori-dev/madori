import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { FileSeoAuditSnapshotStore, SeoAuditEngine, serializeSeoAuditSarif } from '@/lib/seo/audit'

const subject = (id: string) => ({ id, type: 'entry' as const, site: 'en' })
const complete = (id: string, canonical = `https://example.com/${id}`) => ({
  subject: subject(id), title: `Detailed title for ${id}`, description: `A sufficiently descriptive summary for ${id} that gives readers useful context.`, canonical,
  canonicalStatus: 'valid' as const, social: { image: `https://cdn.example.com/${id}.png`, imageAlt: `${id} preview` }, structuredData: { '@type': 'WebPage' }, h1Count: 1,
})

describe('SEO audit engine', () => {
  it('returns stable actionable issues, provenance, counts, and score', () => {
    const report = new SeoAuditEngine().audit({
      now: new Date('2026-08-19T12:00:00.000Z'),
      provenance: { one: { title: 'record', canonical: 'computed' } },
      pages: [{ ...complete('one'), title: 'Tiny', description: undefined, canonicalStatus: 'redirect', indexing: 'noindex', sitemapIncluded: true, social: { image: 'https://cdn.example.com/one.png' }, structuredData: { nope: true }, h1Count: 2 }],
    })
    expect(report).toMatchObject({ version: 1, score: expect.any(Number), summary: { total: expect.any(Number), error: expect.any(Number) } })
    expect(report.issues.map(issue => issue.ruleId)).toEqual(expect.arrayContaining(['seo.title.short', 'seo.description.missing', 'seo.canonical.redirect', 'seo.sitemap.noindex-conflict', 'seo.social.image-alt.missing', 'seo.structured-data.malformed', 'seo.heading.h1-duplicate', 'seo.link.orphan']))
    expect(report.issues.find(issue => issue.ruleId === 'seo.title.short')).toMatchObject({ source: 'record', recommendation: expect.any(String) })
    expect(report.id).toMatch(/^seo_report_[a-f0-9]{24}$/)
  })

  it('detects duplicates, broken links, hreflang reciprocity and redirect cycles', () => {
    const report = new SeoAuditEngine().audit({ pages: [
      { ...complete('one'), internalLinks: [{ href: 'https://example.com/missing' }, { href: 'https://example.com/two', status: 'redirect' }], alternates: [{ locale: 'fr', url: 'https://fr.example.com/un', reciprocal: false }] },
      { ...complete('two'), title: complete('one').title, description: complete('one').description },
    ], redirects: [{ subject: subject('redirect-1'), source: '/a', destination: '/b', chain: ['/a', '/b'], cycle: true }] })
    expect(report.issues.map(issue => issue.ruleId)).toEqual(expect.arrayContaining(['seo.title.duplicate', 'seo.description.duplicate', 'seo.link.internal.broken', 'seo.link.internal.redirect', 'seo.hreflang.non-reciprocal', 'seo.redirect.chain', 'seo.redirect.cycle']))
  })

  it('tracks reverse dependencies for incremental audit decisions', () => {
    const engine = new SeoAuditEngine()
    const report = engine.auditIncremental({ pages: [{ ...complete('one'), dependencies: ['site:en'] }, { ...complete('two'), dependencies: ['one'] }] }, ['site:en'])
    expect(report.affectedSubjects).toEqual(['one', 'site:en', 'two'])
  })

  it('serializes deterministic SARIF without filesystem locations', () => {
    const report = new SeoAuditEngine().audit({ now: new Date('2026-08-19T12:00:00.000Z'), pages: [{ ...complete('one'), title: undefined }] })
    const sarif = JSON.stringify(serializeSeoAuditSarif(report))
    expect(sarif).toContain('2.1.0')
    expect(sarif).toContain('seo.title.missing')
    expect(sarif).not.toContain('file:')
  })
})

describe('operational audit snapshot store', () => {
  const temporary: string[] = []
  afterEach(async () => { await Promise.all(temporary.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true }))) })

  it('writes atomically and applies age and count retention without exposing paths', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-audit-'))
    temporary.push(directory)
    const store = new FileSeoAuditSnapshotStore(new NodeFileSystemAdapter(), directory, { maxSnapshots: 1, retentionDays: 90 })
    const engine = new SeoAuditEngine()
    const first = engine.audit({ now: new Date('2026-08-19T12:00:00.000Z'), pages: [complete('one')] })
    const second = engine.audit({ now: new Date('2026-08-20T12:00:00.000Z'), pages: [complete('two')] })
    await store.save(first)
    const saved = await store.save(second)
    expect(saved).toMatchObject({ id: second.id, report: { id: second.id } })
    const snapshots = await store.list()
    expect(snapshots).toHaveLength(1)
    expect(JSON.stringify(snapshots)).not.toContain(directory)
  })

  it('rejects malformed or oversized operational snapshot state before projecting it', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-audit-'))
    temporary.push(directory)
    const store = new FileSeoAuditSnapshotStore(new NodeFileSystemAdapter(), directory)
    const reportPath = path.join(directory, 'reports', 'snapshots.json')
    await fs.mkdir(path.dirname(reportPath), { recursive: true })
    await fs.writeFile(reportPath, JSON.stringify({ version: 1, snapshots: [{ id: 'untrusted', createdAt: 'nope', report: {} }] }))
    await expect(store.list()).rejects.toThrow('malformed')
    await fs.writeFile(reportPath, 'x'.repeat(5 * 1024 * 1024 + 1))
    await expect(store.list()).rejects.toThrow('exceed storage limit')
  })
})
