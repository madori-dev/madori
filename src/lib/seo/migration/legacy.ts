/**
 * Compatibility bridge for the pre-SEO-Pro frontmatter fields.
 *
 * This module deliberately does not remove legacy keys. Keeping them in place
 * makes the rollout reversible and lets older readers continue to work during
 * the compatibility window.
 */

export const LEGACY_SEO_KEYS = ['meta_title', 'meta_description', 'og_image'] as const

export type LegacySeoKey = (typeof LEGACY_SEO_KEYS)[number]

export interface LegacySeoDocument {
  [key: string]: unknown
  meta_title?: unknown
  meta_description?: unknown
  og_image?: unknown
  seo?: unknown
}
export interface LegacyMigrationChange {
  legacyKey: LegacySeoKey
  targetPath: `seo.${string}`
  value: unknown
  reason: 'migrated' | 'nested-value-preserved'
}

export interface LegacyMigrationResult<T extends LegacySeoDocument = LegacySeoDocument> {
  document: T
  changed: boolean
  migrated: LegacyMigrationChange[]
  preserved: LegacyMigrationChange[]
  warnings: string[]
}

const mappings: ReadonlyArray<readonly [LegacySeoKey, string]> = [
  ['meta_title', 'title'],
  ['meta_description', 'description'],
  ['og_image', 'social.image'],
]

function clone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Date) return new Date(value.getTime()) as T
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = clone(item)
  }
  return result as T
}

function hasValue(value: unknown): boolean {
  return value !== undefined
}

function setNested(target: Record<string, unknown>, path: string, value: unknown): void {
  const [head, ...rest] = path.split('.')
  if (rest.length === 0) {
    target[head] = value
    return
  }
  const existing = target[head]
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
    target[head] = {}
  }
  setNested(target[head] as Record<string, unknown>, rest.join('.'), value)
}

function getNested(target: Record<string, unknown>, path: string): { exists: boolean; value?: unknown } {
  const [head, ...rest] = path.split('.')
  if (!Object.prototype.hasOwnProperty.call(target, head)) return { exists: false }
  if (rest.length === 0) return { exists: true, value: target[head] }
  const next = target[head]
  if (!next || typeof next !== 'object' || Array.isArray(next)) return { exists: false }
  return getNested(next as Record<string, unknown>, rest.join('.'))
}

/** Translate legacy fields without mutating input or overwriting nested SEO. */
export function translateLegacySeo<T extends LegacySeoDocument>(document: T): LegacyMigrationResult<T> {
  const output = clone(document)
  const migrated: LegacyMigrationChange[] = []
  const preserved: LegacyMigrationChange[] = []
  const warnings: string[] = []
  const seo = output.seo

  if (seo !== undefined && (seo === null || typeof seo !== 'object' || Array.isArray(seo))) {
    warnings.push('Nested seo value is not an object; legacy fields were preserved without migration.')
    return { document: output, changed: false, migrated, preserved, warnings }
  }

  if (seo === undefined) output.seo = {}
  const target = output.seo as Record<string, unknown>

  for (const [legacyKey, targetPath] of mappings) {
    if (!Object.prototype.hasOwnProperty.call(output, legacyKey) || !hasValue(output[legacyKey])) continue
    const existing = getNested(target, targetPath)
    const change: LegacyMigrationChange = {
      legacyKey,
      targetPath: `seo.${targetPath}` as `seo.${string}`,
      value: clone(output[legacyKey]),
      reason: existing.exists ? 'nested-value-preserved' : 'migrated',
    }
    if (existing.exists) preserved.push(change)
    else {
      setNested(target, targetPath, clone(output[legacyKey]))
      migrated.push(change)
    }
  }

  // Do not add an empty seo object to documents with no legacy fields.
  if (migrated.length === 0 && seo === undefined) delete output.seo
  return { document: output, changed: migrated.length > 0, migrated, preserved, warnings }
}

export interface SeoMigrationDocument {
  path: string
  data: LegacySeoDocument
}

export interface SeoMigrationReport {
  filesScanned: number
  filesChanged: number
  fieldsMigrated: number
  fieldsPreserved: number
  warnings: Array<{ path: string; message: string }>
  changes: Array<{
    path: string
    migrated: LegacyMigrationChange[]
    preserved: LegacyMigrationChange[]
  }>
}

export function scanLegacySeo(documents: Iterable<SeoMigrationDocument>): SeoMigrationReport {
  const report: SeoMigrationReport = {
    filesScanned: 0,
    filesChanged: 0,
    fieldsMigrated: 0,
    fieldsPreserved: 0,
    warnings: [],
    changes: [],
  }
  for (const item of documents) {
    report.filesScanned++
    const result = translateLegacySeo(item.data)
    report.fieldsMigrated += result.migrated.length
    report.fieldsPreserved += result.preserved.length
    if (result.changed) report.filesChanged++
    if (result.migrated.length || result.preserved.length) {
      report.changes.push({ path: item.path, migrated: result.migrated, preserved: result.preserved })
    }
    for (const message of result.warnings) report.warnings.push({ path: item.path, message })
  }
  return report
}
