import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fc from 'fast-check'
import { rm, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { FileTokenTracker } from '../usage/file-tracker'
import type { UsageRecord, AiOperationType } from '../usage/tracker'

const TEST_STORAGE = path.resolve(process.cwd(), 'storage/ai-test-spend-limit')

// Mock getAiConfig to control spend limit behavior
vi.mock('@/lib/ai/schema', () => ({
  getAiConfig: vi.fn(),
}))

import { getAiConfig } from '@/lib/ai/schema'
const mockGetAiConfig = vi.mocked(getAiConfig)

/**
 * Property 5: Spend limit enforcement rejects when cumulative tokens exceed limit
 * **Validates: Requirements 3.3, 3.4**
 */
describe('Property 5: Spend limit enforcement', () => {
  let tracker: FileTokenTracker

  const validOperations: AiOperationType[] = [
    'editor.generate', 'editor.rewrite', 'editor.summarize', 'editor.continue',
    'seo.title', 'seo.description', 'alt-text', 'blueprint',
    'auto-fill', 'taxonomy', 'bulk',
  ]

  const arbOperation = fc.constantFrom(...validOperations)

  // Generate a usage record with arbitrary token counts
  const arbUsageRecord = fc.record({
    operation: arbOperation,
    model: fc.constantFrom('claude-sonnet-4-20250514', 'gpt-4', 'gpt-3.5-turbo'),
    inputTokens: fc.integer({ min: 0, max: 10000 }),
    outputTokens: fc.integer({ min: 0, max: 10000 }),
  })

  beforeEach(() => {
    tracker = new FileTokenTracker({ storagePath: TEST_STORAGE })
  })

  afterEach(async () => {
    await rm(TEST_STORAGE, { recursive: true, force: true })
  })

  it('rejects when cumulative tokens >= maxTokens', () => {
    fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100000 }),
        fc.array(arbUsageRecord, { minLength: 1, maxLength: 20 }),
        async (maxTokens, records) => {
          // Calculate total tokens from the records
          const totalTokens = records.reduce(
            (sum, r) => sum + r.inputTokens + r.outputTokens, 0,
          )

          // Only test the case where total >= limit
          fc.pre(totalTokens >= maxTokens)

          // Set up config with spend limit
          mockGetAiConfig.mockResolvedValue({
            provider: 'anthropic',
            baseUrl: 'https://api.anthropic.com',
            apiKey: 'sk-test',
            model: 'claude-sonnet-4-20250514',
            spendLimit: { maxTokens, period: 'daily' },
            features: { editor: true, seo: true, altText: true, blueprints: true, autoFill: true, taxonomy: true, bulk: true },
          })

          // Write records directly with current timestamps so they fall in the current period
          const now = new Date()
          const usageRecords: UsageRecord[] = records.map((r, i) => ({
            timestamp: new Date(now.getTime() - (records.length - i) * 1000).toISOString(),
            ...r,
          }))

          await mkdir(TEST_STORAGE, { recursive: true })
          await writeFile(
            path.join(TEST_STORAGE, 'usage.json'),
            JSON.stringify(usageRecords),
            'utf-8',
          )

          const result = await tracker.checkLimit()
          expect(result.allowed).toBe(false)
          expect(result.limit).toBe(maxTokens)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('allows when cumulative tokens < maxTokens', () => {
    fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100000 }),
        fc.array(arbUsageRecord, { minLength: 0, maxLength: 20 }),
        async (maxTokens, records) => {
          // Calculate total tokens from the records
          const totalTokens = records.reduce(
            (sum, r) => sum + r.inputTokens + r.outputTokens, 0,
          )

          // Only test the case where total < limit
          fc.pre(totalTokens < maxTokens)

          // Set up config with spend limit
          mockGetAiConfig.mockResolvedValue({
            provider: 'anthropic',
            baseUrl: 'https://api.anthropic.com',
            apiKey: 'sk-test',
            model: 'claude-sonnet-4-20250514',
            spendLimit: { maxTokens, period: 'daily' },
            features: { editor: true, seo: true, altText: true, blueprints: true, autoFill: true, taxonomy: true, bulk: true },
          })

          // Write records directly with current timestamps
          const now = new Date()
          const usageRecords: UsageRecord[] = records.map((r, i) => ({
            timestamp: new Date(now.getTime() - (records.length - i) * 1000).toISOString(),
            ...r,
          }))

          await mkdir(TEST_STORAGE, { recursive: true })
          await writeFile(
            path.join(TEST_STORAGE, 'usage.json'),
            JSON.stringify(usageRecords),
            'utf-8',
          )

          const result = await tracker.checkLimit()
          expect(result.allowed).toBe(true)
          expect(result.limit).toBe(maxTokens)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('always allows when no spendLimit is configured', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(arbUsageRecord, { minLength: 0, maxLength: 20 }),
        async (records) => {
          // No spend limit configured
          mockGetAiConfig.mockResolvedValue(undefined)

          // Write records
          const now = new Date()
          const usageRecords: UsageRecord[] = records.map((r, i) => ({
            timestamp: new Date(now.getTime() - (records.length - i) * 1000).toISOString(),
            ...r,
          }))

          await mkdir(TEST_STORAGE, { recursive: true })
          await writeFile(
            path.join(TEST_STORAGE, 'usage.json'),
            JSON.stringify(usageRecords),
            'utf-8',
          )

          const result = await tracker.checkLimit()
          expect(result.allowed).toBe(true)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('currentTotal always equals the sum of all tokens in the current period', () => {
    fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100000 }),
        fc.array(arbUsageRecord, { minLength: 0, maxLength: 20 }),
        async (maxTokens, records) => {
          mockGetAiConfig.mockResolvedValue({
            provider: 'anthropic',
            baseUrl: 'https://api.anthropic.com',
            apiKey: 'sk-test',
            model: 'claude-sonnet-4-20250514',
            spendLimit: { maxTokens, period: 'daily' },
            features: { editor: true, seo: true, altText: true, blueprints: true, autoFill: true, taxonomy: true, bulk: true },
          })

          // Write records with current timestamps (within today's period)
          const now = new Date()
          const usageRecords: UsageRecord[] = records.map((r, i) => ({
            timestamp: new Date(now.getTime() - (records.length - i) * 1000).toISOString(),
            ...r,
          }))

          await mkdir(TEST_STORAGE, { recursive: true })
          await writeFile(
            path.join(TEST_STORAGE, 'usage.json'),
            JSON.stringify(usageRecords),
            'utf-8',
          )

          const expectedTotal = records.reduce(
            (sum, r) => sum + r.inputTokens + r.outputTokens, 0,
          )

          const result = await tracker.checkLimit()
          expect(result.currentTotal).toBe(expectedTotal)
        },
      ),
      { numRuns: 100 },
    )
  })
})
