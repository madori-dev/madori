import type { ProviderAdapter, TokenUsage } from '../provider/interface'
import type { TokenTracker } from '../usage/tracker'

/**
 * Bulk processor feature module.
 *
 * Executes AI operations across multiple entries with progress reporting.
 * Satisfies Requirements 11.1, 11.2, 11.3, 11.4, 11.5.
 */

/**
 * Supported bulk operation types.
 * Req 11.3: Support "generate meta descriptions for entries missing them".
 */
export type BulkOperationType = 'generate-meta-descriptions'

/**
 * Represents a single entry to be processed in a bulk operation.
 */
export interface BulkEntry {
  id: string
  collection: string
  content: string
  existingMetaDescription?: string
}

/**
 * Progress event emitted during bulk processing.
 * Req 11.2: Report progress (completed count, total, current entry).
 */
export interface BulkProgressEvent {
  type: 'progress' | 'complete' | 'error' | 'halted'
  completed: number
  total: number
  current?: string
  errors: number
  error?: string
  status?: 'halted'
}

/**
 * Options for configuring the bulk processor.
 */
export interface BulkProcessorOptions {
  provider: ProviderAdapter
  tracker: TokenTracker
  onProgress?: (event: BulkProgressEvent) => void
}

const META_DESCRIPTION_MAX_LENGTH = 160

const META_DESCRIPTION_SYSTEM_PROMPT = `You are an SEO specialist. Generate a concise, compelling meta description for the given content.

Rules:
- The meta description MUST be ${META_DESCRIPTION_MAX_LENGTH} characters or fewer
- Summarize the key value or topic of the content
- Use natural language that encourages clicks
- Do not use quotes around the description
- Return ONLY the meta description text, nothing else`

/**
 * Processes a bulk AI operation across multiple entries.
 *
 * Req 11.1: Accept operation type, scope (entries list), execute against each entry.
 * Req 11.2: Report progress via onProgress callback.
 * Req 11.4: If individual entry fails, log error, skip, continue processing.
 * Req 11.5: Check spend limit before each entry, halt if limit reached.
 *
 * @returns Final BulkProgressEvent summarizing the operation result.
 */
export async function processBulk(
  operation: BulkOperationType,
  entries: BulkEntry[],
  options: BulkProcessorOptions,
): Promise<BulkProgressEvent> {
  const { provider, tracker, onProgress } = options
  const total = entries.length
  let completed = 0
  let errors = 0

  for (const entry of entries) {
    // Req 11.5: Check spend limit before each entry
    const limitCheck = await tracker.checkLimit()
    if (!limitCheck.allowed) {
      const haltedEvent: BulkProgressEvent = {
        type: 'halted',
        completed,
        total,
        current: entry.id,
        errors,
        status: 'halted',
      }
      onProgress?.(haltedEvent)
      return haltedEvent
    }

    try {
      // Execute the AI operation for the current entry
      const usage = await executeOperation(operation, entry, provider)

      // Record token usage via tracker
      await tracker.record({
        operation: 'bulk',
        model: 'unknown',
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      })

      completed++

      // Emit progress event
      const progressEvent: BulkProgressEvent = {
        type: 'progress',
        completed,
        total,
        current: entry.id,
        errors,
      }
      onProgress?.(progressEvent)
    } catch (err) {
      // Req 11.4: Log error, skip entry, continue processing
      errors++

      const errorEvent: BulkProgressEvent = {
        type: 'error',
        completed,
        total,
        current: entry.id,
        errors,
        error: err instanceof Error ? err.message : String(err),
      }
      onProgress?.(errorEvent)
    }
  }

  // Emit final complete event
  const completeEvent: BulkProgressEvent = {
    type: 'complete',
    completed,
    total,
    errors,
  }
  onProgress?.(completeEvent)
  return completeEvent
}

/**
 * Executes a single AI operation against an entry based on the operation type.
 */
async function executeOperation(
  operation: BulkOperationType,
  entry: BulkEntry,
  provider: ProviderAdapter,
): Promise<TokenUsage> {
  switch (operation) {
    case 'generate-meta-descriptions':
      return generateMetaDescriptionForEntry(entry, provider)
    default:
      throw new Error(`Unsupported bulk operation: ${operation}`)
  }
}

/**
 * Generates a meta description for a single entry.
 * Req 11.3: Support "generate meta descriptions for entries missing them".
 */
async function generateMetaDescriptionForEntry(
  entry: BulkEntry,
  provider: ProviderAdapter,
): Promise<TokenUsage> {
  const response = await provider.generateText(entry.content, {
    systemPrompt: META_DESCRIPTION_SYSTEM_PROMPT,
    maxTokens: 200,
    temperature: 0.7,
  })

  return response.usage
}
