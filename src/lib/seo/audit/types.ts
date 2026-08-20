export type SeoAuditSeverity = 'info' | 'warning' | 'error' | 'critical'

export interface SeoAuditSubject {
  /** Opaque content identity; never use a filesystem path or public URL here. */
  id: string
  type: 'entry' | 'term' | 'page' | 'archive' | 'redirect'
  site: string
}

export interface SeoAuditLink {
  href: string
  /** Optional resolver result avoids network access in deterministic audits. */
  status?: 'valid' | 'broken' | 'redirect'
  /** Optional authored source gives editor-facing fixes without exposing a path. */
  source?: string
}

export interface SeoAuditAlternate {
  locale: string
  url: string
  reciprocal?: boolean
}

export interface SeoAuditPage {
  subject: SeoAuditSubject
  published?: boolean
  title?: string | null
  description?: string | null
  canonical?: string | null
  /** Set by caller after canonical URL is checked against public route state. */
  canonicalStatus?: 'valid' | 'missing' | 'redirect' | 'invalid'
  indexing?: 'index' | 'noindex'
  sitemapIncluded?: boolean
  social?: { image?: string | null; imageAlt?: string | null } | null
  structuredData?: unknown
  internalLinks?: SeoAuditLink[]
  alternates?: SeoAuditAlternate[]
  h1Count?: number
  /** IDs or opaque resource keys this page depends on for incremental invalidation. */
  dependencies?: string[]
}

export interface SeoAuditRedirect {
  subject: SeoAuditSubject
  source: string
  destination: string
  chain?: string[]
  cycle?: boolean
}

export interface SeoAuditIssue {
  ruleId: string
  severity: SeoAuditSeverity
  subject: SeoAuditSubject
  message: string
  recommendation: string
  /** Field/channel responsible for value, when supplied by resolver. */
  field?: string
  source?: string
  relatedSubjects?: SeoAuditSubject[]
}

export interface SeoAuditSummary {
  total: number
  info: number
  warning: number
  error: number
  critical: number
}

export interface SeoAuditReport {
  version: 1
  id: string
  createdAt: string
  score: number
  summary: SeoAuditSummary
  issues: SeoAuditIssue[]
  /** Subjects affected by changed dependencies; absent on full runs. */
  affectedSubjects?: string[]
}

export interface SeoAuditInput {
  pages: SeoAuditPage[]
  redirects?: SeoAuditRedirect[]
  /** Source/provenance values from resolver, keyed by opaque subject ID. */
  provenance?: Record<string, Record<string, string>>
  now?: Date
}

export interface SeoAuditSnapshot {
  id: string
  createdAt: string
  report: SeoAuditReport
}

export interface SeoAuditSnapshotRetention {
  maxSnapshots?: number
  retentionDays?: number
}

export interface SeoAuditSnapshotStore {
  list(): Promise<readonly SeoAuditSnapshot[]>
  save(report: SeoAuditReport): Promise<SeoAuditSnapshot>
}
