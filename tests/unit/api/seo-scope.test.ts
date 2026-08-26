import { describe, expect, it } from 'vitest'
import { seoAuthorizationScope } from '@/app/(cp)/api/routes/seo'
import type { MadoriInstance } from '@/lib/madori'

function madori(): MadoriInstance {
  return {
    seoRedirects: { get: async () => ({ redirect: { site: 'site-b' } }) },
    seoNotFound: { list: async () => ({ observations: [{ opaqueId: 'nf_record', site: 'site-b' }] }) },
  } as unknown as MadoriInstance
}

describe('SEO authorization scope derivation', () => {
  it('uses mutation body scope instead of a spoofed query scope', async () => {
    const request = new Request('https://example.test/api/seo/redirects?site=site-a', {
      method: 'POST',
      body: JSON.stringify({ redirect: { site: 'site-b' } }),
    })
    await expect(seoAuthorizationScope(request, 'redirect:write', ['seo', 'redirects'], madori())).resolves.toBe('site-b')
  })

  it('uses stored resource scope before query scope for identifier routes', async () => {
    const request = new Request('https://example.test/api/seo/redirects/record?site=site-a', { method: 'DELETE' })
    await expect(seoAuthorizationScope(request, 'redirect:delete', ['seo', 'redirects', 'record'], madori())).resolves.toBe('site-b')
  })

  it('uses query scope only for filtered list operations', async () => {
    const request = new Request('https://example.test/api/seo/not-found?site=site-a')
    await expect(seoAuthorizationScope(request, 'not-found:read', ['seo', 'not-found'], madori())).resolves.toBe('site-a')
  })

})
