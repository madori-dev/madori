import type { SeoAuditReport, SeoAuditSeverity } from './types'

const level: Record<SeoAuditSeverity, 'note' | 'warning' | 'error'> = { info: 'note', warning: 'warning', error: 'error', critical: 'error' }

/** Deterministic SARIF 2.1.0 projection for CI without leaking storage paths. */
export function serializeSeoAuditSarif(report: SeoAuditReport): Record<string, unknown> {
  const rules = [...new Set(report.issues.map(issue => issue.ruleId))].sort().map(id => ({ id, shortDescription: { text: id } }))
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [{ tool: { driver: { name: 'Madori SEO Audit', rules } }, results: report.issues.map(issue => ({ ruleId: issue.ruleId, level: level[issue.severity], message: { text: issue.message }, properties: { subjectId: issue.subject.id, subjectType: issue.subject.type, site: issue.subject.site, field: issue.field, source: issue.source } })) }],
  }
}
