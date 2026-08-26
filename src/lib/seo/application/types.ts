import type { SeoAuditReport, SeoAuditRunResult } from '@/lib/seo/audit'
import type { RedirectStatus, SeoRedirect } from '@/lib/seo/redirects'
import type { SeoPreviewResult, SeoRuntimeResult } from '@/lib/seo/runtime'

export type SeoContentRequest =
  | { type: 'entry'; site: string; collection: string; slug: string }
  | { type: 'term'; site: string; taxonomy: string; slug: string }

export type SeoPreviewRequest = SeoContentRequest | {
  site?: string
  section?: 'collection' | 'taxonomy'
  handle?: string
}

export interface SeoReportPageRequest { site?: string; page: number; perPage: number }

export interface SeoReportIssueView {
  id: string
  severity: 'notice' | 'warning' | 'error' | 'critical'
  title: string
  description: string
  type: string
}

export interface SeoReportPage {
  report: (Omit<SeoAuditReport, 'issues'> & { issues?: undefined }) | null
  issues: SeoReportIssueView[]
  page: number
  perPage: number
  total: number
}

export type SeoReportStatus =
  | { available: false; site: string | null }
  | ({ available: true; id: string; createdAt: string; issueCount: number } & SeoReportSummary)

export interface SeoReportSummary {
  score: number
  summary: { total: number; info: number; warning: number; error: number; critical: number }
}

export interface SeoReportRunView extends SeoReportSummary {
  id: string
  createdAt: string
  pages: number
  redirects: number
}

export interface PromoteNotFoundRequest {
  site: string
  source: string
  destination: string
  opaqueId?: string
  status?: RedirectStatus
}

export type PromotedNotFound = SeoRedirect & { revision: string; observationDeleted: boolean }

export type SeoApplicationResolution = SeoRuntimeResult | SeoPreviewResult | null

export type SeoApplicationErrorCode = 'REPORTS_DISABLED' | 'SITE_NOT_CONFIGURED'

/** Stable application failure; transport adapters decide how a code becomes a response. */
export class SeoApplicationError extends Error {
  constructor(readonly code: SeoApplicationErrorCode, message: string) {
    super(message)
    this.name = 'SeoApplicationError'
  }
}

export interface SeoReportRunner {
  run(input?: { site?: string; now?: Date }): Promise<SeoAuditRunResult>
}
