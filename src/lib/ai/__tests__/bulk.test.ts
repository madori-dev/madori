import { describe, it, expect, vi } from 'vitest'
import { processBulk } from '../features/bulk'
import type { BulkEntry, BulkProcessorOptions, BulkProgressEvent } from '../features/bulk'
import type { ProviderAdapter, AiResponse, AiStreamEvent } from '../provider/interface'
import type { TokenTracker, LimitCheckResult } from '../usage/tracker'

/**
 * Creates a mock ProviderAdapter for testing bulk processing.
 */
function createMockProvider(overrides?: Partial<ProviderAdapter>): ProviderAdapter {
  return {
    generateText: vi.fn().mockResolvedValue({
      text: 'Generated meta description for testing.',
      usage: { inputTokens: 50, outputTokens: 30 },
    } satisfies AiResponse),
    streamText: vi.fn().mockReturnValue(
      new ReadableStream<AiStreamEvent>({
        start(controller) {
          controller.close()
        },
      }),
    ),
    generateWithVision: vi.fn().mockResolvedValue({
      text: 'vision response',
      usage: { inputTokens: 50, outputTokens: 30 },
    }),
    generateStructured: vi.fn().mockResolvedValue({
      data: {},
      usage: { inputTokens: 10, outputTokens: 10 },
    }),
    ...overrides,
  }
}

/**
 * Creates a mock TokenTracker for testing.
 */
function createMockTracker(overrides?: Partial<TokenTracker>): TokenTracker {
  return {
    record: vi.fn().mockResolvedValue(undefined),
    checkLimit: vi.fn().mockResolvedValue({ allowed: true, currentTotal: 0 } satisfies LimitCheckResult),
    getUsage: vi.fn().mockResolvedValue([]),
    getAggregated: vi.fn().mockResolvedValue([]),
    ...overrides,
  }
}

function createEntries(count: number): BulkEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `entry-${i}`,
    collection: 'blog',
    content: `Content for entry ${i}`,
  }))
}

describe('Bulk Processor: processBulk', () => {
  it('processes all entries and returns complete event', async () => {
    const provider = createMockProvider()
    const tracker = createMockTracker()
    const entries = createEntries(3)

    const result = await processBulk('generate-meta-descriptions', entries, {
      provider,
      tracker,
    })

    expect(result.type).toBe('complete')
    expect(result.completed).toBe(3)
    expect(result.total).toBe(3)
    expect(result.errors).toBe(0)
  })

  it('emits progress events for each entry', async () => {
    const provider = createMockProvider()
    const tracker = createMockTracker()
    const entries = createEntries(2)
    const events: BulkProgressEvent[] = []

    await processBulk('generate-meta-descriptions', entries, {
      provider,
      tracker,
      onProgress: (event) => events.push(event),
    })

    // 2 progress events + 1 complete event
    expect(events).toHaveLength(3)
    expect(events[0]).toMatchObject({ type: 'progress', completed: 1, total: 2, current: 'entry-0' })
    expect(events[1]).toMatchObject({ type: 'progress', completed: 2, total: 2, current: 'entry-1' })
    expect(events[2]).toMatchObject({ type: 'complete', completed: 2, total: 2, errors: 0 })
  })

  it('records token usage for each successful entry', async () => {
    const provider = createMockProvider()
    const tracker = createMockTracker()
    const entries = createEntries(2)

    await processBulk('generate-meta-descriptions', entries, {
      provider,
      tracker,
    })

    expect(tracker.record).toHaveBeenCalledTimes(2)
    expect(tracker.record).toHaveBeenCalledWith({
      operation: 'bulk',
      model: 'unknown',
      inputTokens: 50,
      outputTokens: 30,
    })
  })

  it('checks spend limit before each entry', async () => {
    const provider = createMockProvider()
    const tracker = createMockTracker()
    const entries = createEntries(3)

    await processBulk('generate-meta-descriptions', entries, {
      provider,
      tracker,
    })

    expect(tracker.checkLimit).toHaveBeenCalledTimes(3)
  })

  it('halts when spend limit is reached', async () => {
    const provider = createMockProvider()
    const checkLimit = vi.fn()
      .mockResolvedValueOnce({ allowed: true, currentTotal: 80 })
      .mockResolvedValueOnce({ allowed: false, currentTotal: 100, limit: 100 })
    const tracker = createMockTracker({ checkLimit })
    const entries = createEntries(3)
    const events: BulkProgressEvent[] = []

    const result = await processBulk('generate-meta-descriptions', entries, {
      provider,
      tracker,
      onProgress: (event) => events.push(event),
    })

    expect(result.type).toBe('halted')
    expect(result.status).toBe('halted')
    expect(result.completed).toBe(1)
    expect(result.total).toBe(3)
    // Should have processed only 1 entry before halting
    expect(provider.generateText).toHaveBeenCalledTimes(1)
  })

  it('continues processing when individual entries fail', async () => {
    const generateText = vi.fn()
      .mockResolvedValueOnce({ text: 'desc 1', usage: { inputTokens: 10, outputTokens: 20 } })
      .mockRejectedValueOnce(new Error('Provider timeout'))
      .mockResolvedValueOnce({ text: 'desc 3', usage: { inputTokens: 10, outputTokens: 20 } })
    const provider = createMockProvider({ generateText })
    const tracker = createMockTracker()
    const entries = createEntries(3)
    const events: BulkProgressEvent[] = []

    const result = await processBulk('generate-meta-descriptions', entries, {
      provider,
      tracker,
      onProgress: (event) => events.push(event),
    })

    expect(result.type).toBe('complete')
    expect(result.completed).toBe(2)
    expect(result.errors).toBe(1)
    expect(result.total).toBe(3)
  })

  it('emits error events with error messages for failed entries', async () => {
    const generateText = vi.fn()
      .mockRejectedValueOnce(new Error('Network failure'))
    const provider = createMockProvider({ generateText })
    const tracker = createMockTracker()
    const entries = createEntries(1)
    const events: BulkProgressEvent[] = []

    await processBulk('generate-meta-descriptions', entries, {
      provider,
      tracker,
      onProgress: (event) => events.push(event),
    })

    expect(events[0]).toMatchObject({
      type: 'error',
      current: 'entry-0',
      error: 'Network failure',
      errors: 1,
    })
  })

  it('handles empty entries list', async () => {
    const provider = createMockProvider()
    const tracker = createMockTracker()

    const result = await processBulk('generate-meta-descriptions', [], {
      provider,
      tracker,
    })

    expect(result.type).toBe('complete')
    expect(result.completed).toBe(0)
    expect(result.total).toBe(0)
    expect(result.errors).toBe(0)
  })

  it('does not record usage for failed entries', async () => {
    const generateText = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce({ text: 'ok', usage: { inputTokens: 5, outputTokens: 10 } })
    const provider = createMockProvider({ generateText })
    const tracker = createMockTracker()
    const entries = createEntries(2)

    await processBulk('generate-meta-descriptions', entries, {
      provider,
      tracker,
    })

    // Only 1 successful entry should have recorded usage
    expect(tracker.record).toHaveBeenCalledTimes(1)
  })
})
