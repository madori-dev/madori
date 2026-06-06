import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { WatchMode } from '../watch-mode.js'
import type { GenerationPipeline, GenerationResult } from '../generation-pipeline.js'

function createMockPipeline(): GenerationPipeline {
  return {
    run: vi.fn().mockResolvedValue({
      blueprintsProcessed: 1,
      filesGenerated: 4,
      durationMs: 10,
    } satisfies GenerationResult),
  } as unknown as GenerationPipeline
}

describe('Property 9: Watch mode debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  /**
   * **Validates: Requirements 5.3**
   *
   * For any sequence of N file events within a single debounce window,
   * exactly one regeneration pass fires rather than N passes.
   */
  it('N events within a single debounce window trigger exactly one regeneration', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 50, max: 500 }),
        async (eventCount, debounceMs) => {
          const pipeline = createMockPipeline()
          const watchMode = new WatchMode(
            { blueprintDir: 'resources/blueprints', outputDir: '.madori/generated', debounceMs },
            pipeline
          )

          // Fire all N events rapidly within the debounce window.
          // Space them evenly but ensure total time < debounceMs so the timer never fires mid-batch.
          const intervalBetweenEvents = Math.floor((debounceMs - 1) / eventCount)
          for (let i = 0; i < eventCount; i++) {
            watchMode.scheduleRegeneration()
            if (i < eventCount - 1) {
              await vi.advanceTimersByTimeAsync(intervalBetweenEvents)
            }
          }

          // Before debounce expires after the last event, pipeline should not have been called
          expect(pipeline.run).not.toHaveBeenCalled()

          // Advance past the debounce window from the last event
          await vi.advanceTimersByTimeAsync(debounceMs + 1)

          // Exactly one regeneration pass should have fired
          expect(pipeline.run).toHaveBeenCalledTimes(1)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: Requirements 5.3**
   *
   * If events are separated into distinct batches (with gaps > debounceMs between batches),
   * each batch triggers exactly one regeneration.
   */
  it('separate batches each trigger exactly one regeneration', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 3 }),
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 50, max: 500 }),
        async (batchCount, eventsPerBatch, debounceMs) => {
          const pipeline = createMockPipeline()
          const watchMode = new WatchMode(
            { blueprintDir: 'resources/blueprints', outputDir: '.madori/generated', debounceMs },
            pipeline
          )

          for (let batch = 0; batch < batchCount; batch++) {
            // Fire events within the batch rapidly
            const intervalBetweenEvents = eventsPerBatch > 1
              ? Math.floor((debounceMs - 1) / eventsPerBatch)
              : 0

            for (let i = 0; i < eventsPerBatch; i++) {
              watchMode.scheduleRegeneration()
              if (i < eventsPerBatch - 1) {
                await vi.advanceTimersByTimeAsync(intervalBetweenEvents)
              }
            }

            // Let the debounce expire to complete this batch's regeneration
            await vi.advanceTimersByTimeAsync(debounceMs + 1)

            // After each batch completes, verify cumulative call count
            expect(pipeline.run).toHaveBeenCalledTimes(batch + 1)
          }

          // Total regenerations should equal number of batches
          expect(pipeline.run).toHaveBeenCalledTimes(batchCount)
        }
      ),
      { numRuns: 100 }
    )
  })
})
