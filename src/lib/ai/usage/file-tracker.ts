import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  AggregatedUsage,
  LimitCheckResult,
  TokenTracker,
  UsageQueryOptions,
  UsageRecord,
} from './tracker'
import { getAiConfig } from '@/lib/ai/schema'

const STORAGE_DIR = path.resolve(process.cwd(), 'storage/ai')
const USAGE_FILE = path.join(STORAGE_DIR, 'usage.json')

/**
 * File-based token tracker implementation.
 * Stores usage records in an append-only JSON array at storage/ai/usage.json.
 *
 * Satisfies Requirements 3.1, 3.2, 3.3, 3.4, 3.5.
 */
export class FileTokenTracker implements TokenTracker {
  private storagePath: string
  private filePath: string

  constructor(options?: { storagePath?: string }) {
    this.storagePath = options?.storagePath ?? STORAGE_DIR
    this.filePath = path.join(this.storagePath, 'usage.json')
  }

  /**
   * Appends a usage record with ISO timestamp.
   * Creates storage/ai/ directory on first write if missing (Req 3.2).
   */
  async record(entry: Omit<UsageRecord, 'timestamp'>): Promise<void> {
    await this.ensureStorageDir()

    const record: UsageRecord = {
      timestamp: new Date().toISOString(),
      ...entry,
    }

    const records = await this.readRecords()
    records.push(record)
    await writeFile(this.filePath, JSON.stringify(records, null, 2), 'utf-8')
  }

  /**
   * Checks the configured spend limit against current period usage.
   * Returns { allowed: true } if no limit configured.
   * Sums tokens for the current period (daily/weekly/monthly) and compares to maxTokens (Req 3.3, 3.4).
   */
  async checkLimit(): Promise<LimitCheckResult> {
    const config = await getAiConfig()

    if (!config?.spendLimit) {
      return { allowed: true, currentTotal: 0 }
    }

    const { maxTokens, period } = config.spendLimit
    const periodStart = this.getPeriodStart(period)
    const records = await this.readRecords()

    const currentTotal = records
      .filter((r) => r.timestamp >= periodStart)
      .reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0)

    return {
      allowed: currentTotal < maxTokens,
      currentTotal,
      limit: maxTokens,
    }
  }

  /**
   * Retrieves usage records, optionally filtered by date range or operation type (Req 3.5).
   */
  async getUsage(options?: UsageQueryOptions): Promise<UsageRecord[]> {
    const records = await this.readRecords()

    if (!options) return records

    return records.filter((r) => {
      if (options.from && r.timestamp < options.from) return false
      if (options.to && r.timestamp > options.to) return false
      if (options.operation && r.operation !== options.operation) return false
      return true
    })
  }

  /**
   * Groups records by operation, date, or both, returning aggregated sums (Req 3.5).
   */
  async getAggregated(groupBy: 'operation' | 'date' | 'both'): Promise<AggregatedUsage[]> {
    const records = await this.readRecords()
    const groups = new Map<string, { totalInputTokens: number; totalOutputTokens: number; requestCount: number }>()

    for (const record of records) {
      const key = this.getGroupKey(record, groupBy)

      const existing = groups.get(key) ?? {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        requestCount: 0,
      }

      existing.totalInputTokens += record.inputTokens
      existing.totalOutputTokens += record.outputTokens
      existing.requestCount += 1

      groups.set(key, existing)
    }

    return Array.from(groups.entries()).map(([key, data]) => ({
      key,
      ...data,
    }))
  }

  // --- Private helpers ---

  private getGroupKey(record: UsageRecord, groupBy: 'operation' | 'date' | 'both'): string {
    const date = record.timestamp.slice(0, 10) // YYYY-MM-DD

    switch (groupBy) {
      case 'operation':
        return record.operation
      case 'date':
        return date
      case 'both':
        return `${record.operation}|${date}`
    }
  }

  private getPeriodStart(period: 'daily' | 'weekly' | 'monthly'): string {
    const now = new Date()

    switch (period) {
      case 'daily': {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        return start.toISOString()
      }
      case 'weekly': {
        const day = now.getDay()
        const diff = now.getDate() - day + (day === 0 ? -6 : 1) // Monday start
        const start = new Date(now.getFullYear(), now.getMonth(), diff)
        return start.toISOString()
      }
      case 'monthly': {
        const start = new Date(now.getFullYear(), now.getMonth(), 1)
        return start.toISOString()
      }
    }
  }

  private async ensureStorageDir(): Promise<void> {
    await mkdir(this.storagePath, { recursive: true })
  }

  private async readRecords(): Promise<UsageRecord[]> {
    try {
      const content = await readFile(this.filePath, 'utf-8')
      const parsed = JSON.parse(content)
      if (!Array.isArray(parsed)) return []
      return parsed as UsageRecord[]
    } catch {
      // File doesn't exist yet or is malformed — return empty
      return []
    }
  }
}
