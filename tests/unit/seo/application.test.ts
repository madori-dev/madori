import { describe, expect, it, vi } from 'vitest'
import { SeoApplication, SeoApplicationError, type SeoApplicationOptions } from '@/lib/seo/application'
import type { SeoAuditReport } from '@/lib/seo/audit'

function auditReport(): SeoAuditReport {
  return {
    version: 1,
    id: 'seo_report_aaaaaaaaaaaaaaaaaaaaaaaa',
    createdAt: '2026-08-26T12:00:00.000Z',
    score: 95,
    summary: { total: 2, info: 1, warning: 1, error: 0, critical: 0 },
    issues: [
      { ruleId: 'title', severity: 'warning', subject: { id: 'a', type: 'entry', site: 'en' }, message: 'Title missing', recommendation: 'Add title' },
      { ruleId: 'description', severity: 'info', subject: { id: 'b', type: 'entry', site: 'fr' }, message: 'Description short', recommendation: 'Expand description' },
    ],
  }
}

function application(overrides: Partial<SeoApplicationOptions> = {}) {
  const report = auditReport()
  const runtime = {
    resolveEntry: vi.fn(async () => ({ resolved: { title: 'Published' } })),
    resolveTerm: vi.fn(async () => ({ resolved: { title: 'Term' } })),
    previewEntry: vi.fn(async () => ({ resolved: { title: 'Draft' } })),
    previewTerm: vi.fn(async () => ({ resolved: { title: 'Draft term' } })),
    previewDefaults: vi.fn(async () => ({ resolved: { title: 'Defaults' } })),
  } as unknown as SeoApplicationOptions['runtime']
  const save = vi.fn(async (redirect) => ({ redirect, revision: 'revision-1', path: '/private/redirect.yaml' }))
  const remove = vi.fn(async () => true)
  const options: SeoApplicationOptions = {
    runtime,
    redirects: { save },
    observations: {
      list: vi.fn(async () => ({
        observations: [{ opaqueId: 'nf_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', site: 'en', path: '/missing', query: null, firstSeen: '', lastSeen: '', hits: 1, referrerOrigin: null }],
        revision: null,
        path: '/private/observations.json',
      })),
      delete: remove,
    },
    reportSnapshots: { list: vi.fn(async () => [{ id: report.id, createdAt: report.createdAt, report }]) },
    reportRunner: { run: vi.fn(async () => ({ report, pages: 3, redirects: 2 })) },
    reportsEnabled: true,
    defaultSite: 'en',
    createRedirectId: () => 'redirect_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    ...overrides,
  }
  return { seo: new SeoApplication(options), runtime, save, remove, options }
}

describe('SeoApplication', () => {
  it('keeps authenticated preview details behind one transport-independent interface', async () => {
    const { seo, runtime } = application()

    await seo.preview({ type: 'entry', site: 'en', collection: 'posts', slug: 'draft' })
    await seo.preview({ section: 'taxonomy', handle: 'topics' })

    expect(runtime.previewEntry).toHaveBeenCalledWith(
      { site: 'en', collection: 'posts', slug: 'draft' },
      expect.objectContaining({ isAuthenticated: expect.any(Function) }),
    )
    expect(runtime.previewDefaults).toHaveBeenCalledWith(
      { site: 'en', section: 'taxonomy', handle: 'topics' },
      expect.objectContaining({ isAuthenticated: expect.any(Function) }),
    )
  })

  it('filters, summarizes, and paginates reports consistently for every adapter', async () => {
    const { seo } = application()

    expect(await seo.getReport({ site: 'en' })).toMatchObject({
      score: 96,
      summary: { total: 1, warning: 1 },
      issues: [{ ruleId: 'title' }],
    })
    expect(await seo.report({ site: 'en', page: 1, perPage: 10 })).toEqual(expect.objectContaining({
      total: 1,
      issues: [{ id: 'a:title', severity: 'warning', title: 'Title missing', description: 'Add title', type: 'title' }],
      report: expect.objectContaining({ score: 96, issues: undefined }),
    }))
    expect(await seo.reportStatus({ site: 'en' })).toMatchObject({ available: true, issueCount: 1, score: 96 })
  })

  it('returns a stable error code when report execution is disabled', async () => {
    const { seo } = application({ reportsEnabled: false })

    await expect(seo.runReport()).rejects.toMatchObject<Partial<SeoApplicationError>>({ code: 'REPORTS_DISABLED' })
  })

  it('returns a transport-neutral report execution result', async () => {
    const { seo } = application()

    await expect(seo.runReport({ site: 'en' })).resolves.toMatchObject({
      id: 'seo_report_aaaaaaaaaaaaaaaaaaaaaaaa', pages: 3, redirects: 2, score: 95,
    })
  })

  it('promotes a matching observation and cleans up operational state after redirect commit', async () => {
    const { seo, save, remove } = application()

    const result = await seo.promoteNotFound({
      site: 'en', source: '/missing', destination: '/found',
      opaqueId: 'nf_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', status: 308,
    })

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ source: '/missing', destination: '/found', status: 308 }))
    expect(remove).toHaveBeenCalledWith('nf_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    expect(result).toMatchObject({ revision: 'revision-1', observationDeleted: true })
    expect(result).not.toHaveProperty('path')
  })

  it('keeps committed redirect when optional observation cleanup fails', async () => {
    const remove = vi.fn(async () => { throw new Error('operational storage unavailable') })
    const { seo, save } = application({ observations: { ...application().options.observations, delete: remove } })

    await expect(seo.promoteNotFound({
      site: 'en', source: '/missing', destination: '/found', opaqueId: 'nf_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    })).resolves.toMatchObject({ observationDeleted: false })
    expect(save).toHaveBeenCalledOnce()
  })
})
