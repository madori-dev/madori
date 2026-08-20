import type { SitemapDocument, SitemapUrl } from './types'
import { isAbsoluteHttpUrl, isoDate, xml } from './utils'

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>'

function renderUrl(entry: SitemapUrl): string | undefined {
  if (!isAbsoluteHttpUrl(entry.url)) return undefined
  const imageRefs = (entry.images ?? []).filter((image) => isAbsoluteHttpUrl(image.url))
  const alternates = Object.entries(entry.alternates ?? {}).filter(([, url]) => isAbsoluteHttpUrl(url))
  const priority = typeof entry.priority === 'number' && entry.priority >= 0 && entry.priority <= 1 ? entry.priority.toFixed(1) : undefined
  const lastModified = isoDate(entry.lastModified)
  const lines = [
    '<url>',
    `  <loc>${xml(entry.url)}</loc>`,
    ...(lastModified ? [`  <lastmod>${lastModified}</lastmod>`] : []),
    ...(entry.changeFrequency ? [`  <changefreq>${entry.changeFrequency}</changefreq>`] : []),
    ...(priority ? [`  <priority>${priority}</priority>`] : []),
    ...alternates.map(([locale, url]) => `  <xhtml:link rel="alternate" hreflang="${xml(locale)}" href="${xml(url)}" />`),
    ...imageRefs.flatMap((image) => [
      '  <image:image>',
      `    <image:loc>${xml(image.url)}</image:loc>`,
      ...(image.title ? [`    <image:title>${xml(image.title)}</image:title>`] : []),
      ...(image.caption ? [`    <image:caption>${xml(image.caption)}</image:caption>`] : []),
      '  </image:image>',
    ]),
    '</url>',
  ]
  return lines.join('\n')
}

export function generateSitemapXml(document: SitemapDocument): string {
  const sitemaps = (document.sitemaps ?? []).filter((sitemap) => isAbsoluteHttpUrl(sitemap.url))
  if (sitemaps.length) {
    const body = sitemaps.map((sitemap) => {
      const lastModified = isoDate(sitemap.lastModified)
      return ['<sitemap>', `  <loc>${xml(sitemap.url)}</loc>`, ...(lastModified ? [`  <lastmod>${lastModified}</lastmod>`] : []), '</sitemap>'].join('\n')
    }).join('\n')
    return `${XML_DECLARATION}\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`
  }

  const urls = (document.urls ?? []).map(renderUrl).filter((value): value is string => Boolean(value)).join('\n')
  const namespaces = ['xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"']
  if ((document.urls ?? []).some((entry) => Object.keys(entry.alternates ?? {}).length)) namespaces.push('xmlns:xhtml="http://www.w3.org/1999/xhtml"')
  if ((document.urls ?? []).some((entry) => entry.images?.length)) namespaces.push('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"')
  return `${XML_DECLARATION}\n<urlset ${namespaces.join(' ')}>\n${urls}\n</urlset>\n`
}
