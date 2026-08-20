import type { HumansDocument, RobotsDocument } from './types'
import { isAbsoluteHttpUrl } from './utils'

export function generateRobotsTxt(document: RobotsDocument): string {
  const groups = document.groups?.length ? document.groups : [{ userAgent: '*', allow: ['/'] }]
  const lines = groups.flatMap((group) => [
    ...(Array.isArray(group.userAgent) ? group.userAgent : [group.userAgent]).map((agent) => `User-agent: ${agent}`),
    ...(group.allow ?? []).map((path) => `Allow: ${path}`),
    ...(group.disallow ?? []).map((path) => `Disallow: ${path}`),
    ...(typeof group.crawlDelay === 'number' && group.crawlDelay >= 0 ? [`Crawl-delay: ${group.crawlDelay}`] : []),
    '',
  ])
  if (document.host && isAbsoluteHttpUrl(document.host)) lines.push(`Host: ${document.host}`)
  for (const sitemap of document.sitemapUrls ?? []) if (isAbsoluteHttpUrl(sitemap)) lines.push(`Sitemap: ${sitemap}`)
  return `${lines.join('\n').trimEnd()}\n`
}

function section(title: string, values: string[] | undefined): string[] {
  if (!values?.length) return []
  return [`/* ${title} */`, ...values, '']
}

export function generateHumansTxt(document: HumansDocument): string {
  const lines = [
    ...section('TEAM', document.team),
    ...section('THANKS', document.thanks),
    ...section('SITE', document.site),
  ]
  return lines.length ? `${lines.join('\n').trimEnd()}\n` : ''
}
