import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { FileTokenTracker } from '../usage/file-tracker'
import type { AiOperationType } from '../usage/tracker'

const ALL_OPERATIONS: AiOperationType[] = [
  'editor.generate',
  'editor.rewrite',
  'editor.summarize',
  'editor.continue',
  'seo.title',
  'seo.description',
  'alt-text',
  'blueprint',
  'auto-fill',
  'taxonomy',
  'bulk',
]

/**
 * Property 4: Usage records contain all required fields
 * **Validates: Requirements 3.1**
 *
 * For any completed AI operation, the appended usage record SHALL contain
 * valid ISO timestamp, valid operation type, model string, and non-negative token counts.
 */
describe('Property 4: Usage records contain all required fields', () => {
  // Arbitraries
  const arbOperation = fc.constantFrom(...ALL_OPERATIONS)
  const arbModel = fc.string({ minLength: 1, maxLength: 100 })
  const arbTokenCount = fc.nat({ max: 1_000_000 })

  let testDir: string
  let tracker: FileTokenTracker

  beforeEach(() => {
    testDir = path.join(tmpdir(), `madori-test-usage-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    tracker = new FileTokenTracker({ storagePath: testDir })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('stored record has a valid ISO timestamp after calling record()', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbOperation,
        arbModel,
        arbTokenCount,
        arbTokenCount,
        async (operation, model, inputTokens, outputTokens) => {
          // Fresh tracker per run to isolate
          const dir = path.join(tmpdir(), `madori-pbt-${Date.now()}-${Math.random().toString(36).slice(2)}`)
          const t = new FileTokenTracker({ storagePath: dir })

          await t.record({ operation, model, inputTokens, outputTokens })
          const records = await t.getUsage()
          const record = records[records.length - 1]

          // Timestamp must be a valid ISO 8601 string parseable by Date
          expect(record.timestamp).toBeDefined()
          const parsed = new Date(record.timestamp)
          expect(parsed.getTime()).not.toBeNaN()
          // toISOString round-trips for valid ISO dates
          expect(parsed.toISOString()).toBe(record.timestamp)

          await rm(dir, { recursive: true, force: true })
        },
      ),
      { numRuns: 50 },
    )
  })

  it('stored record operation matches what was passed', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbOperation,
        arbModel,
        arbTokenCount,
        arbTokenCount,
        async (operation, model, inputTokens, outputTokens) => {
          const dir = path.join(tmpdir(), `madori-pbt-${Date.now()}-${Math.random().toString(36).slice(2)}`)
          const t = new FileTokenTracker({ storagePath: dir })

          await t.record({ operation, model, inputTokens, outputTokens })
          const records = await t.getUsage()
          const record = records[records.length - 1]

          expect(record.operation).toBe(operation)

          await rm(dir, { recursive: true, force: true })
        },
      ),
      { numRuns: 50 },
    )
  })

  it('inputTokens and outputTokens are preserved exactly', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbOperation,
        arbModel,
        arbTokenCount,
        arbTokenCount,
        async (operation, model, inputTokens, outputTokens) => {
          const dir = path.join(tmpdir(), `madori-pbt-${Date.now()}-${Math.random().toString(36).slice(2)}`)
          const t = new FileTokenTracker({ storagePath: dir })

          await t.record({ operation, model, inputTokens, outputTokens })
          const records = await t.getUsage()
          const record = records[records.length - 1]

          expect(record.inputTokens).toBe(inputTokens)
          expect(record.outputTokens).toBe(outputTokens)

          await rm(dir, { recursive: true, force: true })
        },
      ),
      { numRuns: 50 },
    )
  })

  it('model string is preserved exactly', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbOperation,
        arbModel,
        arbTokenCount,
        arbTokenCount,
        async (operation, model, inputTokens, outputTokens) => {
          const dir = path.join(tmpdir(), `madori-pbt-${Date.now()}-${Math.random().toString(36).slice(2)}`)
          const t = new FileTokenTracker({ storagePath: dir })

          await t.record({ operation, model, inputTokens, outputTokens })
          const records = await t.getUsage()
          const record = records[records.length - 1]

          expect(record.model).toBe(model)

          await rm(dir, { recursive: true, force: true })
        },
      ),
      { numRuns: 50 },
    )
  })

  it('timestamp is always a valid ISO 8601 date string parseable by Date', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbOperation,
        arbModel,
        arbTokenCount,
        arbTokenCount,
        async (operation, model, inputTokens, outputTokens) => {
          const dir = path.join(tmpdir(), `madori-pbt-${Date.now()}-${Math.random().toString(36).slice(2)}`)
          const t = new FileTokenTracker({ storagePath: dir })

          await t.record({ operation, model, inputTokens, outputTokens })
          const records = await t.getUsage()
          const record = records[records.length - 1]

          // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
          const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          expect(record.timestamp).toMatch(isoRegex)

          // Must be parseable
          const date = new Date(record.timestamp)
          expect(Number.isNaN(date.getTime())).toBe(false)

          // Round-trip: parsing and re-serializing yields same string
          expect(date.toISOString()).toBe(record.timestamp)

          await rm(dir, { recursive: true, force: true })
        },
      ),
      { numRuns: 50 },
    )
  })
})
