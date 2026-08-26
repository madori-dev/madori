import { randomUUID } from 'node:crypto'
import type { SeoAuditReport, SeoAuditSnapshotStore } from '@/lib/seo/audit'
import { SEO_REDIRECT_VERSION, promoteNotFoundObservation } from '@/lib/seo/redirects'
import type { FileSeoRedirectRepository, NotFoundObservationStore } from '@/lib/seo/redirects'
import type { SeoRuntime } from '@/lib/seo/runtime'
import {
  SeoApplicationError,
  type PromoteNotFoundRequest,
  type PromotedNotFound,
  type SeoContentRequest,
  type SeoPreviewRequest,
  type SeoReportPage,
  type SeoReportPageRequest,
  type SeoReportRunView,
  type SeoReportRunner,
  type SeoReportStatus,
  type SeoReportSummary,
} from './types'

export interface SeoApplicationOptions {
  runtime: Pick<SeoRuntime, 'resolveEntry' | 'resolveTerm' | 'previewEntry' | 'previewTerm' | 'previewDefaults'>
  redirects: Pick<FileSeoRedirectRepository, 'save'>
  observations: Pick<NotFoundObservationStore, 'list' | 'delete'>
  reportSnapshots: Pick<SeoAuditSnapshotStore, 'list'>
  reportRunner: SeoReportRunner
  reportsEnabled: boolean
  defaultSite?: string
  createRedirectId?: () => string
}

/** Transport-independent SEO use cases. HTTP and GraphQL are adapters at this seam. */
export class SeoApplication {
  private readonly createRedirectId: () => string

  constructor(private readonly options: SeoApplicationOptions) {
    this.createRedirectId = options.createRedirectId ?? (() => `redirect_${randomUUID().replaceAll('-', '')}`)
  }

  async resolve(input: SeoContentRequest) {
    return input.type === 'entry'
      ? this.options.runtime.resolveEntry({ site: input.site, collection: input.collection, slug: input.slug })
      : this.options.runtime.resolveTerm({ site: input.site, taxonomy: input.taxonomy, slug: input.slug })
  }

  async preview(input: SeoPreviewRequest) {
    const authenticated = { isAuthenticated: () => true }
    if ('type' in input) {
      return input.type === 'entry'
        ? this.options.runtime.previewEntry({ site: input.site, collection: input.collection, slug: input.slug }, authenticated)
        : this.options.runtime.previewTerm({ site: input.site, taxonomy: input.taxonomy, slug: input.slug }, authenticated)
    }
    const site = input.site ?? this.options.defaultSite
    if (!site) throw new SeoApplicationError('SITE_NOT_CONFIGURED', 'No SEO site is configured')
    return this.options.runtime.previewDefaults({
      site,
      ...(input.section && input.handle ? { section: input.section, handle: input.handle } : {}),
    }, authenticated)
  }

  async getReport(input: { id?: string; site?: string } = {}): Promise<SeoAuditReport | null> {
    const snapshots = await this.options.reportSnapshots.list()
    const report = (input.id ? snapshots.find(snapshot => snapshot.id === input.id) : snapshots[0])?.report ?? null
    return report && input.site ? filterReport(report, input.site) : report
  }

  async report(input: SeoReportPageRequest): Promise<SeoReportPage> {
    const report = await this.getReport({ site: input.site })
    if (!report) return { report: null, issues: [], page: input.page, perPage: input.perPage, total: 0 }
    const summary = summarizeIssues(report.issues)
    const issues = report.issues
      .slice((input.page - 1) * input.perPage, input.page * input.perPage)
      .map(issue => ({
        id: `${issue.subject.id}:${issue.ruleId}`,
        severity: issue.severity === 'info' ? 'notice' as const : issue.severity,
        title: issue.message,
        description: issue.recommendation,
        type: issue.ruleId,
      }))
    return { report: { ...report, ...summary, issues: undefined }, issues, page: input.page, perPage: input.perPage, total: report.issues.length }
  }

  async reportStatus(input: { site?: string } = {}): Promise<SeoReportStatus> {
    const report = await this.getReport({ site: input.site })
    if (!report) return { available: false, site: input.site ?? null }
    return { available: true, id: report.id, createdAt: report.createdAt, ...summarizeIssues(report.issues), issueCount: report.issues.length }
  }

  async runReport(input: { site?: string } = {}): Promise<SeoReportRunView> {
    if (!this.options.reportsEnabled) throw new SeoApplicationError('REPORTS_DISABLED', 'SEO reports are disabled')
    return reportRunView(await this.options.reportRunner.run(input))
  }

  async promoteNotFound(input: PromoteNotFoundRequest): Promise<PromotedNotFound> {
    const suggestion = promoteNotFoundObservation(input.site, input.source, input.destination)
    const observation = input.opaqueId
      ? (await this.options.observations.list()).observations.find(item => item.opaqueId === input.opaqueId)
      : undefined
    const cleanupId = observation?.site === input.site && observation.path === suggestion.source
      ? observation.opaqueId
      : undefined
    const saved = await this.options.redirects.save({
      version: SEO_REDIRECT_VERSION,
      id: this.createRedirectId(),
      ...suggestion,
      status: input.status ?? suggestion.status,
    })
    let observationDeleted = false
    if (cleanupId) {
      try {
        observationDeleted = await this.options.observations.delete(cleanupId)
      } catch {
        // Authored redirect remains committed when operational cleanup fails.
      }
    }
    return { ...saved.redirect, revision: saved.revision, observationDeleted }
  }
}

export function summarizeIssues(issues: readonly SeoAuditReport['issues'][number][]): SeoReportSummary {
  const summary = { total: issues.length, info: 0, warning: 0, error: 0, critical: 0 }
  const penalties = { info: 1, warning: 4, error: 10, critical: 20 }
  let penalty = 0
  for (const issue of issues) {
    summary[issue.severity]++
    penalty += penalties[issue.severity]
  }
  return { score: Math.max(0, 100 - penalty), summary }
}

function filterReport(report: SeoAuditReport, site: string): SeoAuditReport {
  const issues = report.issues.filter(issue => issue.subject.site === site)
  return { ...report, ...summarizeIssues(issues), issues }
}

function reportRunView(result: Awaited<ReturnType<SeoReportRunner['run']>>): SeoReportRunView {
  return {
    id: result.report.id,
    createdAt: result.report.createdAt,
    score: result.report.score,
    summary: result.report.summary,
    pages: result.pages,
    redirects: result.redirects,
  }
}
