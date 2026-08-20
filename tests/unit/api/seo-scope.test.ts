import { describe, expect, it } from 'vitest'
import { _matchingNotFoundObservationForTesting, _seoAuthorizationScopeForTesting, _summarizeSeoIssuesForTesting } from '@/app/(cp)/api/[...path]/route'
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
    await expect(_seoAuthorizationScopeForTesting(request, 'redirect:write', ['seo', 'redirects'], madori())).resolves.toBe('site-b')
  })

  it('uses stored resource scope before query scope for identifier routes', async () => {
    const request = new Request('https://example.test/api/seo/redirects/record?site=site-a', { method: 'DELETE' })
    await expect(_seoAuthorizationScopeForTesting(request, 'redirect:delete', ['seo', 'redirects', 'record'], madori())).resolves.toBe('site-b')
  })

  it('uses query scope only for filtered list operations', async () => {
    const request = new Request('https://example.test/api/seo/not-found?site=site-a')
    await expect(_seoAuthorizationScopeForTesting(request, 'not-found:read', ['seo', 'not-found'], madori())).resolves.toBe('site-a')
  })

  it('recomputes filtered report score and summary from visible issues', () => {
    expect(_summarizeSeoIssuesForTesting([{ severity: 'warning' }, { severity: 'error' }])).toEqual({
      score: 86,
      summary: { total: 2, info: 0, warning: 1, error: 1, critical: 0 },
    })
  })

  it('cleans up only the observation matching promoted site and source', () => {
    const observation = { opaqueId: 'nf_site_b', site: 'site-b', path: '/missing' }
    expect(_matchingNotFoundObservationForTesting(observation, 'site-a', '/missing')).toBeUndefined()
    expect(_matchingNotFoundObservationForTesting(observation, 'site-b', '/other')).toBeUndefined()
    expect(_matchingNotFoundObservationForTesting(observation, 'site-b', '/missing')).toBe('nf_site_b')
  })
})
