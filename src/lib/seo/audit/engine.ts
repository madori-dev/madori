import * as crypto from 'node:crypto'
import type { SeoAuditInput, SeoAuditIssue, SeoAuditPage, SeoAuditRedirect, SeoAuditReport, SeoAuditSeverity } from './types'
import { SeoAuditDependencyGraph } from './dependency-graph'

const penalties: Record<SeoAuditSeverity, number> = { info: 1, warning: 4, error: 10, critical: 20 }

/** Deterministic, side-effect free audit over already-resolved published SEO state. */
export class SeoAuditEngine {
  readonly dependencies = new SeoAuditDependencyGraph()

  audit(input: SeoAuditInput): SeoAuditReport {
    this.dependencies.sync(input.pages.map(page => ({ id: page.subject.id, dependencies: page.dependencies })))
    const pages = input.pages.filter(page => page.published !== false)
    const issues = [
      ...pages.flatMap(page => pageIssues(page, input.provenance?.[page.subject.id])),
      ...duplicateIssues(pages),
      ...orphanIssues(pages),
      ...redirectIssues(input.redirects ?? []),
    ].sort(compareIssues)
    return report(issues, input.now)
  }

  auditIncremental(input: SeoAuditInput, changedIds: readonly string[]): SeoAuditReport {
    const reportValue = this.audit(input)
    const affected = this.dependencies.affectedBy(changedIds)
    return { ...reportValue, affectedSubjects: affected }
  }
}

function pageIssues(page: SeoAuditPage, provenance?: Record<string, string>): SeoAuditIssue[] {
  const issues: SeoAuditIssue[] = []
  const add = (ruleId: string, severity: SeoAuditSeverity, message: string, recommendation: string, field?: string) => issues.push({
    ruleId, severity, subject: page.subject, message, recommendation, field, source: field ? provenance?.[field] : undefined,
  })
  const title = text(page.title)
  if (!title) add('seo.title.missing', 'error', 'Page has no SEO title.', 'Set a concise, descriptive title.', 'title')
  else if (title.length < 10) add('seo.title.short', 'warning', 'SEO title is shorter than 10 characters.', 'Expand title with useful context.', 'title')
  else if (title.length > 60) add('seo.title.long', 'warning', 'SEO title exceeds 60 characters.', 'Shorten title to reduce search-result truncation.', 'title')
  const description = text(page.description)
  if (!description) add('seo.description.missing', 'error', 'Page has no meta description.', 'Add a clear summary of page content.', 'description')
  else if (description.length < 50) add('seo.description.short', 'warning', 'Meta description is shorter than 50 characters.', 'Add enough detail to describe page value.', 'description')
  else if (description.length > 160) add('seo.description.long', 'warning', 'Meta description exceeds 160 characters.', 'Shorten description to reduce search-result truncation.', 'description')
  const canonical = text(page.canonical)
  if (!canonical) add('seo.canonical.missing', 'error', 'Page has no canonical URL.', 'Set or compute one absolute canonical URL.', 'canonical')
  else if (!isHttpUrl(canonical) || page.canonicalStatus === 'invalid') add('seo.canonical.invalid', 'error', 'Canonical URL is invalid.', 'Use an absolute HTTP(S) canonical URL without credentials.', 'canonical')
  else if (page.canonicalStatus === 'missing') add('seo.canonical.broken', 'error', 'Canonical URL does not resolve to a published page.', 'Point canonical at a live canonical page.', 'canonical')
  else if (page.canonicalStatus === 'redirect') add('seo.canonical.redirect', 'warning', 'Canonical URL redirects.', 'Use final destination as canonical URL.', 'canonical')
  if (page.indexing === 'noindex' && page.sitemapIncluded) add('seo.sitemap.noindex-conflict', 'error', 'Noindex page appears in sitemap.', 'Remove page from sitemap or allow indexing.', 'sitemap')
  if (!page.social?.image) add('seo.social.image.missing', 'warning', 'Page has no social image.', 'Add a relevant social image or configure a site fallback.', 'social.image')
  else if (!page.social.imageAlt) add('seo.social.image-alt.missing', 'warning', 'Social image has no alternative text.', 'Describe social image for accessible previews.', 'social.imageAlt')
  if (page.structuredData !== undefined && !validStructuredData(page.structuredData)) add('seo.structured-data.malformed', 'error', 'Structured data is not a valid Schema.org object or graph.', 'Provide object nodes with @type values only.', 'jsonLd')
  if ((page.h1Count ?? 1) > 1) add('seo.heading.h1-duplicate', 'warning', 'Page contains multiple H1 headings.', 'Keep one primary H1 per page.', 'h1')
  for (const link of page.internalLinks ?? []) {
    if (!isHttpUrl(link.href) && !link.href.startsWith('/')) add('seo.link.invalid', 'warning', 'Internal link has an invalid target.', 'Use a valid relative path or absolute HTTP(S) URL.', link.source ?? 'links')
    else if (link.status === 'broken') add('seo.link.internal.broken', 'error', 'Internal link target is not published.', 'Update link or publish destination.', link.source ?? 'links')
    else if (link.status === 'redirect') add('seo.link.internal.redirect', 'warning', 'Internal link points to a redirect.', 'Link directly to final destination.', link.source ?? 'links')
  }
  for (const alternate of page.alternates ?? []) {
    if (!isHttpUrl(alternate.url)) add('seo.hreflang.invalid', 'error', `Hreflang ${alternate.locale} has an invalid URL.`, 'Use an absolute HTTP(S) URL.', 'alternates')
    else if (alternate.reciprocal === false) add('seo.hreflang.non-reciprocal', 'warning', `Hreflang ${alternate.locale} is not reciprocal.`, 'Add reciprocal alternate on translated page.', 'alternates')
  }
  return issues
}

function duplicateIssues(pages: SeoAuditPage[]): SeoAuditIssue[] {
  return duplicateBy(pages, 'title', page => text(page.title), 'seo.title.duplicate', 'Duplicate SEO title detected.', 'Differentiate title to avoid competing search results.')
    .concat(duplicateBy(pages, 'description', page => text(page.description), 'seo.description.duplicate', 'Duplicate meta description detected.', 'Write page-specific description.'))
}

function duplicateBy(pages: SeoAuditPage[], field: string, value: (page: SeoAuditPage) => string | undefined, ruleId: string, message: string, recommendation: string): SeoAuditIssue[] {
  const groups = new Map<string, SeoAuditPage[]>()
  for (const page of pages) {
    const item = value(page)?.toLocaleLowerCase()
    if (item) groups.set(item, [...(groups.get(item) ?? []), page])
  }
  return [...groups.values()].filter(group => group.length > 1).flatMap(group => group.map(page => ({ ruleId, severity: 'warning' as const, subject: page.subject, message, recommendation, field, relatedSubjects: group.filter(other => other !== page).map(other => other.subject) })))
}

function orphanIssues(pages: SeoAuditPage[]): SeoAuditIssue[] {
  const inbound = new Set<string>()
  const pageByCanonical = new Map(pages.flatMap(page => canonicalKeys(page.canonical, page.subject.site).map(key => [key, page] as const)))
  const issues: SeoAuditIssue[] = []
  for (const page of pages) for (const link of page.internalLinks ?? []) {
    const key = linkKey(link.href, page.subject.site)
    const target = key ? pageByCanonical.get(key) : undefined
    if (target) inbound.add(target.subject.id)
    else if (link.href.startsWith('/') || isHttpUrl(link.href)) issues.push({ ruleId: 'seo.link.internal.broken', severity: 'error', subject: page.subject, message: 'Internal link target is not a published audited page.', recommendation: 'Update link or publish destination.', field: link.source ?? 'links' })
  }
  return issues.concat(pages.filter(page => page.canonical && !inbound.has(page.subject.id)).map(page => ({ ruleId: 'seo.link.orphan', severity: 'warning' as const, subject: page.subject, message: 'Published page has no inbound internal links.', recommendation: 'Link to page from relevant published content.', field: 'links' })))
}

function redirectIssues(redirects: SeoAuditRedirect[]): SeoAuditIssue[] {
  return redirects.flatMap(redirect => {
    const issues: SeoAuditIssue[] = []
    if (redirect.cycle) issues.push({ ruleId: 'seo.redirect.cycle', severity: 'critical', subject: redirect.subject, message: 'Redirect is part of a cycle.', recommendation: 'Point redirect directly to final destination.', field: 'destination' })
    if ((redirect.chain?.length ?? 0) > 1) issues.push({ ruleId: 'seo.redirect.chain', severity: 'error', subject: redirect.subject, message: 'Redirect has an intermediate hop.', recommendation: 'Replace destination with final URL.', field: 'destination' })
    return issues
  })
}

function report(issues: SeoAuditIssue[], now?: Date): SeoAuditReport {
  const summary = { total: issues.length, info: 0, warning: 0, error: 0, critical: 0 }
  for (const issue of issues) summary[issue.severity]++
  const score = Math.max(0, 100 - issues.reduce((total, issue) => total + penalties[issue.severity], 0))
  const createdAt = (now ?? new Date()).toISOString()
  return { version: 1, id: `seo_report_${crypto.createHash('sha256').update(`${createdAt}:${issues.map(issue => `${issue.ruleId}:${issue.subject.id}`).join('|')}`).digest('hex').slice(0, 24)}`, createdAt, score, summary, issues }
}

function text(value: string | null | undefined): string | undefined { const normalized = value?.trim(); return normalized || undefined }
function isHttpUrl(value: string): boolean { try { const url = new URL(value); return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password } catch { return false } }
function normalizeUrl(value: string | null | undefined): string | undefined { if (!value) return undefined; try { const url = new URL(value, 'https://madori.invalid'); url.hash = ''; return url.toString().replace(/\/$/, '') } catch { return undefined } }
function canonicalKeys(value: string | null | undefined, site: string): string[] {
  const normalized = normalizeUrl(value)
  if (!normalized) return []
  const url = new URL(normalized)
  return [normalized, `${site}:path:${url.pathname.replace(/\/$/, '') || '/'}`]
}
function linkKey(value: string, site: string): string | undefined {
  if (value.startsWith('/')) return `${site}:path:${value.split(/[?#]/)[0].replace(/\/$/, '') || '/'}`
  return normalizeUrl(value)
}
function validStructuredData(value: unknown): boolean {
  const nodes = Array.isArray(value) ? value : value && typeof value === 'object' && '@graph' in value ? (value as { '@graph': unknown })['@graph'] : [value]
  return Array.isArray(nodes) && nodes.every(node => !!node && typeof node === 'object' && typeof (node as Record<string, unknown>)['@type'] === 'string')
}
function compareIssues(left: SeoAuditIssue, right: SeoAuditIssue): number { return left.ruleId.localeCompare(right.ruleId) || left.subject.id.localeCompare(right.subject.id) }
