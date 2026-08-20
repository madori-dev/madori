import { getMadori } from '@/lib/madori'
import { getRequestSiteFromRequest } from '@/lib/seo/next'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  try {
    const [site, { config, seoRuntime }] = await Promise.all([
      getRequestSiteFromRequest(request),
      getMadori(),
    ])
    if (!config.seo.enabled || !config.seo.sitemap) return unavailable()

    return new Response(await seoRuntime.sitemapXml(site), {
      headers: { 'content-type': 'application/xml; charset=utf-8' },
    })
  } catch {
    return unavailable(500)
  }
}

function unavailable(status = 404): Response {
  return new Response('Not Found\n', {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  })
}
