import { describe, it } from 'vitest'
import fc from 'fast-check'
import { createStreamingProcessor } from '../streaming-processor.js'

/**
 * Validates: Requirements 6.5, 7.5
 * Property 12: Streaming processor respects batch size
 */

async function* asyncFrom<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item
  }
}

describe('StreamingProcessor — Property Tests', () => {
  it('Property 12: all batches have at most batchSize items', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer(), { minLength: 1, maxLength: 200 }),
        fc.integer({ min: 1, max: 200 }),
        async (items, rawBatchSize) => {
          const batchSize = Math.min(rawBatchSize, items.length)
          const processor = createStreamingProcessor<number, number>()
          const sinkBatches: number[][] = []

          await processor.process(
            asyncFrom(items),
            (n) => n,
            async (batch) => { sinkBatches.push([...batch]) },
            { batchSize }
          )

          for (const batch of sinkBatches) {
            if (batch.length > batchSize) {
              return false
            }
          }
          return true
        }
      )
    )
  })

  it('Property 12: total items across all sink calls equals N (no transform errors)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer(), { minLength: 1, maxLength: 200 }),
        fc.integer({ min: 1, max: 200 }),
        async (items, rawBatchSize) => {
          const batchSize = Math.min(rawBatchSize, items.length)
          const processor = createStreamingProcessor<number, number>()
          const sinkBatches: number[][] = []

          await processor.process(
            asyncFrom(items),
            (n) => n,
            async (batch) => { sinkBatches.push([...batch]) },
            { batchSize }
          )

          const totalSinkItems = sinkBatches.reduce((sum, b) => sum + b.length, 0)
          return totalSinkItems === items.length
        }
      )
    )
  })

  it('Property 12: all batches except possibly the last have exactly batchSize items', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer(), { minLength: 1, maxLength: 200 }),
        fc.integer({ min: 1, max: 200 }),
        async (items, rawBatchSize) => {
          const batchSize = Math.min(rawBatchSize, items.length)
          const processor = createStreamingProcessor<number, number>()
          const sinkBatches: number[][] = []

          await processor.process(
            asyncFrom(items),
            (n) => n,
            async (batch) => { sinkBatches.push([...batch]) },
            { batchSize }
          )

          // All batches except the last must have exactly batchSize items
          for (let i = 0; i < sinkBatches.length - 1; i++) {
            if (sinkBatches[i].length !== batchSize) {
              return false
            }
          }

          // Last batch must have between 1 and batchSize items
          const lastBatch = sinkBatches[sinkBatches.length - 1]
          if (lastBatch.length < 1 || lastBatch.length > batchSize) {
            return false
          }

          return true
        }
      )
    )
  })

  it('Property 12: totalProcessed equals source array length', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.anything(), { minLength: 0, maxLength: 200 }),
        async (items) => {
          const processor = createStreamingProcessor<unknown, unknown>()

          const result = await processor.process(
            asyncFrom(items),
            (x) => x,
            async () => {},
            { batchSize: 50 }
          )

          return result.totalProcessed === items.length
        }
      )
    )
  })

  it('Property 12: success + skipped = processed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer(), { minLength: 0, maxLength: 200 }),
        fc.integer({ min: 0, max: 100 }),
        async (items, failMod) => {
          // Use failMod to determine which items throw during transform
          const mod = failMod === 0 ? 1 : failMod
          const processor = createStreamingProcessor<number, number>()

          const result = await processor.process(
            asyncFrom(items),
            (n) => {
              if (mod > 0 && n % mod === 0) throw new Error('fail')
              return n
            },
            async () => {},
            { batchSize: 50 }
          )

          return result.totalSuccess + result.totalSkipped === result.totalProcessed
        }
      )
    )
  })

  it('Property 12: errors count matches totalSkipped', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer(), { minLength: 0, maxLength: 200 }),
        fc.integer({ min: 2, max: 50 }),
        async (items, failMod) => {
          const processor = createStreamingProcessor<number, number>()

          const result = await processor.process(
            asyncFrom(items),
            (n) => {
              if (n % failMod === 0) throw new Error('fail')
              return n
            },
            async () => {},
            { batchSize: 50 }
          )

          return result.errors.length === result.totalSkipped
        }
      )
    )
  })
})
