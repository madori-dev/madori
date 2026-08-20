import type { JsonLdGraph, JsonLdNode, ResolvedSeoOutputView } from './types'
import { isAbsoluteHttpUrl, requireAbsoluteHttpUrl, stableId } from './utils'

/** Build stable Schema.org nodes; no executable or user-supplied templates are evaluated. */
export function generateJsonLd(view: ResolvedSeoOutputView): JsonLdGraph {
  const canonical = requireAbsoluteHttpUrl(view.canonical, 'canonical')
  const nodes: JsonLdNode[] = []
  const siteId = stableId(canonical, 'website')
  const organization = view.organization

  if (view.siteName) {
    nodes.push({ '@type': 'WebSite', '@id': siteId, name: view.siteName, url: new URL('/', canonical).toString() })
  }

  if (organization) {
    const organizationId = stableId(organization.url && isAbsoluteHttpUrl(organization.url) ? organization.url : canonical, 'organization')
    nodes.push({
      '@type': organization.type ?? 'Organization',
      '@id': organizationId,
      name: organization.name,
      ...(organization.url && isAbsoluteHttpUrl(organization.url) ? { url: organization.url } : {}),
      ...(organization.logo && isAbsoluteHttpUrl(organization.logo) ? { logo: organization.logo } : {}),
      ...(organization.sameAs?.filter(isAbsoluteHttpUrl).length ? { sameAs: organization.sameAs.filter(isAbsoluteHttpUrl) } : {}),
    })
  }

  const image = view.social?.enabled === false || !isAbsoluteHttpUrl(view.social?.image) ? undefined : view.social.image
  const configuredType = view.jsonLd?.type
  const pageType = configuredType && configuredType !== 'custom'
    ? configuredType
    : view.pageType === 'article' ? 'Article' : 'WebPage'
  const pageNode: JsonLdNode = {
    '@type': pageType,
    '@id': stableId(canonical, 'webpage'),
    url: canonical,
    name: view.title,
    isPartOf: { '@id': siteId },
    ...(view.description ? { description: view.description } : {}),
    ...(image ? { image } : {}),
  }

  if (view.pageType === 'article') {
    if (view.article?.author) {
      pageNode.author = { '@type': organization?.type ?? 'Organization', name: view.article.author }
    }
    if (view.article?.publishedAt) pageNode.datePublished = view.article.publishedAt
    if (view.article?.modifiedAt) pageNode.dateModified = view.article.modifiedAt
  }
  nodes.push(pageNode)

  const custom = view.jsonLd?.type === 'custom' ? view.jsonLd.custom : undefined
  if (custom && typeof custom['@type'] === 'string' && custom['@type'].length > 0) {
    nodes.push(custom as JsonLdNode)
  }

  const breadcrumbs = view.breadcrumbs?.filter((crumb) => crumb.name && isAbsoluteHttpUrl(crumb.url)) ?? []
  if (breadcrumbs.length) {
    nodes.push({
      '@type': 'BreadcrumbList',
      '@id': stableId(canonical, 'breadcrumb'),
      itemListElement: breadcrumbs.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: crumb.name,
        item: crumb.url,
      })),
    })
  }

  return { '@context': 'https://schema.org', '@graph': nodes }
}

/** Safe for embedding directly inside `<script type="application/ld+json">`. */
export function serializeJsonLd(graph: JsonLdGraph): string {
  return JSON.stringify(graph)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
}
