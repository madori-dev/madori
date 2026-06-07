import { describe, it, expect, afterAll } from 'vitest'
import * as fc from 'fast-check'
import { rm, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { FileTokenTracker } from '../usage/file-tracker'
import type { UsageRecord, AiOperationType } from '../usage/tracker'

const TEST_STORAGE_BASE = path.resolve(process.cwd(), 'storage/ai-test-usage-aggregation')

let iterationCount = 0

/**
 * Property 6: Usage aggregation produces correct sums
 * **Validates: Requirements 3.5, 12.2**
 *
 * For any set of records, grouping produces correct totals for
 * totalInputTokens, totalOutputTokens, and requestCount.
 */
describe('Property 6: Usage aggregation produces correct sums', () => {
  const validOperations: AiOperationType[] = [
    'editor.generate', 'editor.rewrite', 'editor.summarize', 'editor.continue',
    'seo.title', 'seo.description', 'alt-text', 'blueprint',
    'auto-fill', 'taxonomy', 'bulk',
  ]

  const arbOperation = fc.constantFrom(...validOperations)

  // Generate dates within a small range to get interesting groupings
  const arbDate = fc.constantFrom(
    '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05',
  )

  // Generate a usage record with arbitrary token counts and controlled timestamps
  const arbUsageRecord = fc.record({
    operation: arbOperation,
    model: fc.constantFrom('claude-sonnet-4-20250514', 'gpt-4', 'gpt-3.5-turbo'),
    inputTokens: fc.integer({ min: 0, max: 10000 }),
    outputTokens: fc.integer({ min: 0, max: 10000 }),
    date: arbDate,
  })

  afterAll(async () => {
    await rm(TEST_STORAGE_BASE, { recursive: true, force: true })
  })

  /**
   * Helper: write generated records to disk with proper timestamps.
   * Uses a unique directory per iteration to avoid race conditions.
   */
  async function writeRecords(
    records: Array<{ operation: AiOperationType; model: string; inputTokens: number; outputTokens: number; date: string }>,
  ): Promise<{ usageRecords: UsageRecord[]; tracker: FileTokenTracker }> {
    const storagePath = path.join(TEST_STORAGE_BASE, String(iterationCount++))

    const usageRecords: UsageRecord[] = records.map((r, i) => ({
      timestamp: `${r.date}T${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00.000Z`,
      operation: r.operation,
      model: r.model,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
    }))

    await mkdir(storagePath, { recursive: true })
    await writeFile(
      path.join(storagePath, 'usage.json'),
      JSON.stringify(usageRecords),
      'utf-8',
    )

    const tracker = new FileTokenTracker({ storagePath })
    return { usageRecords, tracker }
  }

  it('groupBy operation: sum of totalInputTokens across groups equals sum of all inputTokens', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbUsageRecord, { minLength: 0, maxLength: 30 }),
        async (records) => {
          const { tracker } = await writeRecords(records)

          const aggregated = await tracker.getAggregated('operation')

          const expectedTotalInput = records.reduce((sum, r) => sum + r.inputTokens, 0)
          const expectedTotalOutput = records.reduce((sum, r) => sum + r.outputTokens, 0)
          const expectedCount = records.length

          const actualTotalInput = aggregated.reduce((sum, g) => sum + g.totalInputTokens, 0)
          const actualTotalOutput = aggregated.reduce((sum, g) => sum + g.totalOutputTokens, 0)
          const actualCount = aggregated.reduce((sum, g) => sum + g.requestCount, 0)

          expect(actualTotalInput).toBe(expectedTotalInput)
          expect(actualTotalOutput).toBe(expectedTotalOutput)
          expect(actualCount).toBe(expectedCount)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('groupBy date: token sums per group match records for that date', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbUsageRecord, { minLength: 1, maxLength: 30 }),
        async (records) => {
          const { tracker } = await writeRecords(records)

          const aggregated = await tracker.getAggregated('date')

          // Build expected groups by date
          const expectedByDate = new Map<string, { input: number; output: number; count: number }>()
          for (const r of records) {
            const existing = expectedByDate.get(r.date) ?? { input: 0, output: 0, count: 0 }
            existing.input += r.inputTokens
            existing.output += r.outputTokens
            existing.count += 1
            expectedByDate.set(r.date, existing)
          }

          // Verify each aggregated group matches
          for (const group of aggregated) {
            const expected = expectedByDate.get(group.key)
            expect(expected).toBeDefined()
            expect(group.totalInputTokens).toBe(expected!.input)
            expect(group.totalOutputTokens).toBe(expected!.output)
            expect(group.requestCount).toBe(expected!.count)
          }

          // Verify no groups are missing
          expect(aggregated.length).toBe(expectedByDate.size)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('groupBy both: per-group sums match records for that operation|date pair', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbUsageRecord, { minLength: 1, maxLength: 30 }),
        async (records) => {
          const { tracker } = await writeRecords(records)

          const aggregated = await tracker.getAggregated('both')

          // Build expected groups by operation|date
          const expectedByBoth = new Map<string, { input: number; output: number; count: number }>()
          for (const r of records) {
            const key = `${r.operation}|${r.date}`
            const existing = expectedByBoth.get(key) ?? { input: 0, output: 0, count: 0 }
            existing.input += r.inputTokens
            existing.output += r.outputTokens
            existing.count += 1
            expectedByBoth.set(key, existing)
          }

          // Verify each aggregated group matches
          for (const group of aggregated) {
            const expected = expectedByBoth.get(group.key)
            expect(expected).toBeDefined()
            expect(group.totalInputTokens).toBe(expected!.input)
            expect(group.totalOutputTokens).toBe(expected!.output)
            expect(group.requestCount).toBe(expected!.count)
          }

          // Verify no groups are missing
          expect(aggregated.length).toBe(expectedByBoth.size)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('each group requestCount equals number of records in that group', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('operation' as const, 'date' as const, 'both' as const),
        fc.array(arbUsageRecord, { minLength: 1, maxLength: 30 }),
        async (groupBy, records) => {
          const { usageRecords, tracker } = await writeRecords(records)

          const aggregated = await tracker.getAggregated(groupBy)

          // Build expected counts per key
          const expectedCounts = new Map<string, number>()
          for (const r of usageRecords) {
            let key: string
            switch (groupBy) {
              case 'operation':
                key = r.operation
                break
              case 'date':
                key = r.timestamp.slice(0, 10)
                break
              case 'both':
                key = `${r.operation}|${r.timestamp.slice(0, 10)}`
                break
            }
            expectedCounts.set(key, (expectedCounts.get(key) ?? 0) + 1)
          }

          for (const group of aggregated) {
            expect(group.requestCount).toBe(expectedCounts.get(group.key))
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
