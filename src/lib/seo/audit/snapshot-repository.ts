import * as path from 'node:path'
import { AtomicFileWriter } from '@/lib/fs/atomic-writer'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import { SeoStorageError } from '@/lib/seo/storage/errors'
import { seoStorageLock } from '@/lib/seo/storage/lock'
import { assertSafeStoragePath, immutable, pathWithin } from '@/lib/seo/storage/utils'
import type { SeoAuditReport, SeoAuditSnapshot, SeoAuditSnapshotRetention, SeoAuditSnapshotStore } from './types'

const DEFAULT_MAX_SNAPSHOTS = 50
const DEFAULT_RETENTION_DAYS = 90
const HARD_MAX_SNAPSHOTS = 500
const MAX_SNAPSHOT_FILE_BYTES = 5 * 1024 * 1024
const MAX_ISSUES_PER_REPORT = 20_000

/** Operational storage; serialised reports have no server paths or credentials. */
export class FileSeoAuditSnapshotStore implements SeoAuditSnapshotStore {
  private readonly root: string
  private readonly filePath: string
  private readonly writer: AtomicFileWriter
  private readonly maxSnapshots: number
  private readonly retentionMs: number

  constructor(private readonly fs: FileSystemAdapter, operationalStoragePath: string, retention: SeoAuditSnapshotRetention = {}) {
    this.root = path.resolve(operationalStoragePath)
    this.filePath = path.resolve(this.root, 'reports', 'snapshots.json')
    if (!pathWithin(this.root, this.filePath)) throw new SeoStorageError('SEO report snapshot path escapes configured root.')
    this.writer = new AtomicFileWriter(fs)
    this.maxSnapshots = Math.min(HARD_MAX_SNAPSHOTS, Math.max(1, Math.floor(retention.maxSnapshots ?? DEFAULT_MAX_SNAPSHOTS)))
    this.retentionMs = Math.max(1, Math.floor(retention.retentionDays ?? DEFAULT_RETENTION_DAYS)) * 86_400_000
  }

  async list(): Promise<readonly SeoAuditSnapshot[]> {
    await assertSafeStoragePath(this.fs, this.root, this.filePath)
    if (!await this.fs.exists(this.filePath)) return immutable([])
    const raw = await this.fs.readFile(this.filePath)
    if (Buffer.byteLength(raw, 'utf8') > MAX_SNAPSHOT_FILE_BYTES) throw new SeoStorageError('SEO report snapshots exceed storage limit.')
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { throw new SeoStorageError('SEO report snapshots are malformed.') }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { snapshots?: unknown }).snapshots)) throw new SeoStorageError('SEO report snapshot document is malformed.')
    const snapshots = (parsed as { snapshots: unknown[] }).snapshots
    if (snapshots.length > HARD_MAX_SNAPSHOTS) throw new SeoStorageError('SEO report snapshots exceed retention limit.')
    return immutable(snapshots.map(parseSnapshot).map(snapshot => immutable(snapshot)))
  }

  async save(report: SeoAuditReport): Promise<SeoAuditSnapshot> {
    const safeReport = parseReport(report)
    return seoStorageLock.run(this.filePath, async () => {
      const snapshot: SeoAuditSnapshot = { id: safeReport.id, createdAt: safeReport.createdAt, report: safeReport }
      const now = Date.parse(snapshot.createdAt)
      const snapshots = [...await this.list(), snapshot]
        .filter(item => Date.parse(item.createdAt) >= now - this.retentionMs)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, this.maxSnapshots)
      const raw = `${JSON.stringify({ version: 1, snapshots }, null, 2)}\n`
      if (Buffer.byteLength(raw, 'utf8') > MAX_SNAPSHOT_FILE_BYTES) throw new SeoStorageError('SEO report snapshot exceeds storage limit.')
      const result = await this.writer.writeFileAtomic(this.filePath, raw)
      if (!result.success) throw result.error ?? new SeoStorageError('Could not store SEO report snapshot.')
      return immutable(snapshot)
    })
  }
}

function parseSnapshot(value: unknown): SeoAuditSnapshot {
  if (!value || typeof value !== 'object') throw new SeoStorageError('SEO report snapshot is malformed.')
  const snapshot = value as Partial<SeoAuditSnapshot>
  const report = parseReport(snapshot.report)
  if (snapshot.id !== report.id || snapshot.createdAt !== report.createdAt) throw new SeoStorageError('SEO report snapshot identity is malformed.')
  return { id: report.id, createdAt: report.createdAt, report }
}

function parseReport(value: unknown): SeoAuditReport {
  if (!value || typeof value !== 'object') throw new SeoStorageError('SEO audit report is malformed.')
  const report = value as Partial<SeoAuditReport>
  if (report.version !== 1 || typeof report.id !== 'string' || !/^seo_report_[a-f0-9]{24}$/.test(report.id) || typeof report.createdAt !== 'string' || Number.isNaN(Date.parse(report.createdAt))) throw new SeoStorageError('SEO audit report identity is malformed.')
  const score = report.score
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 100 || !report.summary || typeof report.summary !== 'object' || !Array.isArray(report.issues) || report.issues.length > MAX_ISSUES_PER_REPORT) throw new SeoStorageError('SEO audit report structure is malformed.')
  const summary = report.summary as unknown as Record<string, unknown>
  for (const key of ['total', 'info', 'warning', 'error', 'critical']) if (!Number.isInteger(summary[key]) || (summary[key] as number) < 0) throw new SeoStorageError('SEO audit report summary is malformed.')
  return report as SeoAuditReport
}
