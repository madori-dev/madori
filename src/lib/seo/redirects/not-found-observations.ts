import * as crypto from 'node:crypto'
import * as path from 'node:path'
import { AtomicFileWriter } from '@/lib/fs/atomic-writer'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import { SeoRevisionConflictError, SeoStorageError } from '@/lib/seo/storage/errors'
import { seoStorageLock } from '@/lib/seo/storage/lock'
import { assertSafeStoragePath, immutable, pathWithin, revisionFor } from '@/lib/seo/storage/utils'
import { normalizeRedirectSource, parseNotFoundObservations } from './schema'
import type { NotFoundRetentionOptions, NotFoundSnapshot, ObserveNotFoundInput } from './types'

const DEFAULT_MAX_RECORDS = 1_000
const DEFAULT_RETENTION_DAYS = 90

/** Privacy-safe aggregate 404 counters. This storage is deliberately not Git-authored. */
export class NotFoundObservationStore {
  private readonly filePath: string
  private readonly writer: AtomicFileWriter
  private readonly maxRecords: number
  private readonly retentionMs: number

  constructor(private readonly fs: FileSystemAdapter, operationalStoragePath: string, options: NotFoundRetentionOptions = {}) {
    const root = path.resolve(operationalStoragePath)
    this.filePath = path.resolve(root, 'not-found-observations.json')
    if (!pathWithin(root, this.filePath)) throw new SeoStorageError('404 observation path escapes configured root.')
    this.writer = new AtomicFileWriter(fs)
    this.maxRecords = Math.max(1, Math.floor(options.maxRecords ?? DEFAULT_MAX_RECORDS))
    this.retentionMs = Math.max(1, Math.floor(options.retentionDays ?? DEFAULT_RETENTION_DAYS)) * 86_400_000
  }

  async list(): Promise<NotFoundSnapshot> {
    await assertSafeStoragePath(this.fs, path.dirname(this.filePath), this.filePath)
    if (!await this.fs.exists(this.filePath)) return immutable({ observations: immutable([]), revision: null, path: this.filePath })
    const raw = await this.fs.readFile(this.filePath)
    const observations = parseNotFoundObservations(JSON.parse(raw)).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
    return immutable({ observations: immutable(observations.map(observation => immutable(observation))), revision: revisionFor(raw), path: this.filePath })
  }

  async observe(input: ObserveNotFoundInput, expectedRevision?: string): Promise<NotFoundSnapshot> {
    return seoStorageLock.run(this.filePath, async () => {
      await assertSafeStoragePath(this.fs, path.dirname(this.filePath), this.filePath)
      const current = await this.list()
      if (expectedRevision !== undefined && expectedRevision !== current.revision) throw new SeoRevisionConflictError(this.filePath)
      const observedAt = input.observedAt ?? new Date()
      if (Number.isNaN(observedAt.getTime())) throw new SeoStorageError('Observation time is invalid.')
      const site = normalizeSite(input.site)
      const publicPath = normalizeRedirectSource(input.path)
      const now = observedAt.toISOString()
      const query = input.query ? 'redacted' as const : null
      const referrerOrigin = originOnly(input.referrer)
      const existingIndex = current.observations.findIndex(item => item.site === site && item.path === publicPath)
      const observations = [...current.observations]
      if (existingIndex >= 0) {
        const prior = observations[existingIndex]
        observations[existingIndex] = { ...prior, lastSeen: now, hits: prior.hits + 1, query: prior.query ?? query, referrerOrigin: prior.referrerOrigin ?? referrerOrigin }
      } else {
        observations.push({ opaqueId: `nf_${crypto.randomUUID().replaceAll('-', '')}`, site, path: publicPath, query, firstSeen: now, lastSeen: now, hits: 1, referrerOrigin })
      }
      const cutoff = observedAt.getTime() - this.retentionMs
      const retained = observations.filter(item => new Date(item.lastSeen).getTime() >= cutoff)
        .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen) || b.hits - a.hits)
        .slice(0, this.maxRecords)
      const raw = `${JSON.stringify(retained, null, 2)}\n`
      const result = await this.writer.writeFileAtomic(this.filePath, raw)
      if (!result.success) throw result.error ?? new SeoStorageError('Could not store 404 observation.')
      return immutable({ observations: immutable(retained.map(item => immutable(item))), revision: revisionFor(raw), path: this.filePath })
    })
  }

  async delete(opaqueId: string, expectedRevision?: string): Promise<boolean> {
    if (!/^nf_[a-f0-9]{32}$/.test(opaqueId)) throw new SeoStorageError('Invalid 404 observation ID.')
    return seoStorageLock.run(this.filePath, async () => {
      const current = await this.list()
      if (expectedRevision !== undefined && expectedRevision !== current.revision) throw new SeoRevisionConflictError(this.filePath)
      const observations = current.observations.filter(item => item.opaqueId !== opaqueId)
      if (observations.length === current.observations.length) return false
      const raw = `${JSON.stringify(observations, null, 2)}\n`
      const result = await this.writer.writeFileAtomic(this.filePath, raw)
      if (!result.success) throw result.error ?? new SeoStorageError('Could not delete 404 observation.')
      return true
    })
  }
}

function normalizeSite(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) throw new SeoStorageError('Invalid site handle.')
  return value
}

function originOnly(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return null
    return url.origin
  } catch { return null }
}
