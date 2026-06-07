/**
 * Token usage tracking interfaces and types.
 *
 * Satisfies Requirements 3.1, 3.2, 3.3, 3.4, 3.5.
 */

/**
 * All AI operation types that can be tracked.
 */
export type AiOperationType =
  | 'editor.generate'
  | 'editor.rewrite'
  | 'editor.summarize'
  | 'editor.continue'
  | 'seo.title'
  | 'seo.description'
  | 'alt-text'
  | 'blueprint'
  | 'auto-fill'
  | 'taxonomy'
  | 'bulk'

/**
 * A single usage record appended to the usage log.
 */
export interface UsageRecord {
  timestamp: string
  operation: AiOperationType
  model: string
  inputTokens: number
  outputTokens: number
}

/**
 * Options for querying usage records.
 */
export interface UsageQueryOptions {
  from?: string // ISO date string
  to?: string   // ISO date string
  operation?: AiOperationType
}

/**
 * Aggregated usage summary for a group of records.
 */
export interface AggregatedUsage {
  key: string // operation name, date string, or "operation|date"
  totalInputTokens: number
  totalOutputTokens: number
  requestCount: number
}

/**
 * Result of a spend limit check.
 */
export interface LimitCheckResult {
  allowed: boolean
  currentTotal: number
  limit?: number
}

/**
 * Token tracker interface.
 * Implementations handle persistence, limit checking, and aggregation.
 */
export interface TokenTracker {
  /** Append a usage record with auto-generated ISO timestamp. */
  record(entry: Omit<UsageRecord, 'timestamp'>): Promise<void>

  /** Check if the current spend period allows another request. */
  checkLimit(): Promise<LimitCheckResult>

  /** Retrieve usage records, optionally filtered. */
  getUsage(options?: UsageQueryOptions): Promise<UsageRecord[]>

  /** Get aggregated usage grouped by operation, date, or both. */
  getAggregated(groupBy: 'operation' | 'date' | 'both'): Promise<AggregatedUsage[]>
}
