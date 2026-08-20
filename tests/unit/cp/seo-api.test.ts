import { afterEach, describe, expect, it, vi } from 'vitest'
import { SeoApiRequestError, seoApi } from '@/components/cp/seo/api'

describe('SEO CP API client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses documented envelope and no-store requests', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [], meta: { requestId: 'req_1', version: 1 } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(seoApi.sites()).resolves.toMatchObject({ data: [], meta: { requestId: 'req_1' } })
    expect(fetchMock).toHaveBeenCalledWith('/api/seo/sites', expect.objectContaining({ cache: 'no-store' }))
  })

  it('preserves field-aware errors from API', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'SEO_INVALID_INPUT', message: 'Source is invalid', fields: { source: ['Must start with /'] } }, meta: {} }), { status: 422 })))

    await expect(seoApi.redirects()).rejects.toMatchObject<Partial<SeoApiRequestError>>({ name: 'SeoApiRequestError', status: 422, details: { fields: { source: ['Must start with /'] } } })
  })
})
