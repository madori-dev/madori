import { describe, expect, it, vi } from 'vitest'
import { createSeoHandlers } from '@/app/(cp)/api/handlers/seo'
import type { SeoHandlersDependencies } from '@/app/(cp)/api/handlers/seo'
import { SEO_DOCUMENT_VERSION } from '@/lib/seo/domain'

const siteSnapshot = {
  document: { version: SEO_DOCUMENT_VERSION, kind: 'site' as const, site: 'en', seo: { title: { kind: 'literal' as const, value: 'Welcome' } } },
  revision: 'a'.repeat(64), path: '/private/resources/seo/sites/en.yaml',
}

function request(url: string, init?: RequestInit) { return new Request(`http://localhost${url}`, init) }
async function json(response: Response) { return response.json() as Promise<Record<string, unknown>> }

describe('SEO API handler factory', () => {
  const authorized = { authorize: () => true }
  function dependencies() {
    return {
      repository: {
        getSite: vi.fn(async () => siteSnapshot), listSites: vi.fn(async () => [siteSnapshot]),
        saveSite: vi.fn(async (value: unknown) => ({ ...siteSnapshot, document: value })), deleteSite: vi.fn(async () => true),
        getSection: vi.fn(async () => null), listSections: vi.fn(async () => []), saveSection: vi.fn(), deleteSection: vi.fn(),
      },
      redirects: { get: vi.fn(async () => null), list: vi.fn(async () => []), save: vi.fn(), delete: vi.fn(async () => true) },
      notFound: { list: vi.fn(async () => ({ observations: [{ opaqueId: 'nf_1', site: 'en', path: '/missing', hits: 2 }], revision: 'b'.repeat(64), path: '/private/observations.json' })) },
    } as unknown as SeoHandlersDependencies
  }

  it('returns stable envelope and never exposes storage paths', async () => {
    const handlers = createSeoHandlers(dependencies(), authorized)
    const response = await handlers.handleGetSite(request('/api/seo/sites/en', { headers: { 'x-request-id': 'req_test' } }), 'en')
    expect(response.status).toBe(200)
    const payload = await json(response)
    expect(payload.meta).toMatchObject({ requestId: 'req_test', version: 1 })
    expect(payload.data).not.toHaveProperty('path')
    expect(JSON.stringify(payload)).not.toContain('/private')
  })

  it('persists site settings with a revision and validates payload size', async () => {
    const deps = dependencies(); const handlers = createSeoHandlers(deps, authorized)
    const response = await handlers.handleSaveSite(request('/api/seo/sites/en', { method: 'POST', body: JSON.stringify({ seo: { title: { kind: 'literal', value: 'New title' } }, expectedRevision: 'a'.repeat(64) }) }), 'en')
    expect(response.status).toBe(200)
    expect(deps.repository.saveSite).toHaveBeenCalledWith(expect.objectContaining({ site: 'en' }), { expectedRevision: 'a'.repeat(64) })
    const tooLarge = await handlers.handleSaveSite(request('/api/seo/sites/en', { method: 'POST', body: JSON.stringify({ seo: { title: { kind: 'literal', value: 'x' } }, padding: 'x'.repeat(270_000) }) }), 'en')
    expect(tooLarge.status).toBe(413)
  })

  it('requires authorization', async () => {
    const handlers = createSeoHandlers(dependencies(), { authorize: () => false })
    const response = await handlers.handleListSites(request('/api/seo/sites'))
    expect(response.status).toBe(403)
    expect(((await json(response)).error as Record<string, unknown>).code).toBe('FORBIDDEN')
  })

  it('paginates operational 404 observations and removes storage metadata', async () => {
    const handlers = createSeoHandlers(dependencies(), authorized)
    const response = await handlers.handleListNotFound(request('/api/seo/not-found?page=1&perPage=1'))
    const payload = await json(response)
    expect(payload.data).toHaveLength(1)
    expect(payload.meta).toMatchObject({ page: 1, perPage: 1, total: 1, storage: 'operational' })
    expect(JSON.stringify(payload)).not.toContain('/private')
  })

  it('filters 404 observations to the authorized query site', async () => {
    const deps = dependencies()
    deps.notFound.list.mockResolvedValue({
      observations: [
        { opaqueId: 'nf_1', site: 'en', path: '/missing', hits: 2 },
        { opaqueId: 'nf_2', site: 'fr', path: '/prive', hits: 4 },
      ],
      revision: 'b'.repeat(64),
      path: '/private/observations.json',
    } as never)
    const response = await createSeoHandlers(deps, authorized).handleListNotFound(request('/api/seo/not-found?site=en'))
    const payload = await json(response)
    expect(payload.data).toEqual([expect.objectContaining({ site: 'en', path: '/missing' })])
    expect(payload.meta).toMatchObject({ total: 1 })
  })

  it('uses opaque request IDs and structured validation errors', async () => {
    const handlers = createSeoHandlers(dependencies(), authorized)
    const response = await handlers.handleGetSite(request('/api/seo/sites/../outside'), '../outside')
    const payload = await json(response)
    expect(response.status).toBe(422)
    expect((payload.error as Record<string, unknown>).code).toBe('SEO_INVALID_INPUT')
    expect((payload.meta as Record<string, unknown>).requestId).toMatch(/^req_[A-Za-z0-9]+$/)
  })

  it('runs a report only with report-run authorization', async () => {
    const run = vi.fn(async () => ({ id: 'seo_report_1', pages: 2 }))
    const handlers = createSeoHandlers({ ...dependencies(), reports: { run } }, authorized)
    const response = await handlers.handleRunReport(request('/api/seo/report/run', { method: 'POST', body: JSON.stringify({ site: 'en' }) }))
    expect(response.status).toBe(201)
    expect(run).toHaveBeenCalledWith({ site: 'en' })

    const forbidden = createSeoHandlers({ ...dependencies(), reports: { run } }, { authorize: (_request, capability) => capability !== 'report:run' })
    expect((await forbidden.handleRunReport(request('/api/seo/report/run', { method: 'POST', body: '{}' }))).status).toBe(403)
  })

  it('passes opaque observation identity through promotion for cleanup', async () => {
    const promoteNotFound = vi.fn(async () => ({ observationDeleted: true }))
    const handlers = createSeoHandlers({ ...dependencies(), promoteNotFound }, authorized)
    const response = await handlers.handlePromoteNotFound(request('/api/seo/not-found/promote', {
      method: 'POST',
      body: JSON.stringify({ site: 'en', source: '/missing', destination: '/found', opaqueId: 'nf_123', status: 301 }),
    }))
    expect(response.status).toBe(200)
    expect(promoteNotFound).toHaveBeenCalledWith(expect.objectContaining({ opaqueId: 'nf_123' }))
  })
})
