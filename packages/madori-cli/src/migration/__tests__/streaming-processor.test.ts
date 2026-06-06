import { describe, it, expect, vi } from 'vitest'
import { createStreamingProcessor } from '../streaming-processor.js'
import type { ProcessResult } from '../streaming-processor.js'

async function* asyncFrom<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item
  }
}

describe('StreamingProcessor', () => {
  it('processes all items through transform and sink', async () => {
    const processor = createStreamingProcessor<number, string>()
    const sinkBatches: string[][] = []

    const result = await processor.process(
      asyncFrom([1, 2, 3]),
      (n) => `item-${n}`,
      async (batch) => { sinkBatches.push([...batch]) },
      { batchSize: 10 }
    )

    expect(result.totalProcessed).toBe(3)
    expect(result.totalSuccess).toBe(3)
    expect(result.totalSkipped).toBe(0)
    expect(result.errors).toEqual([])
    expect(sinkBatches).toEqual([['item-1', 'item-2', 'item-3']])
  })

  it('batches items according to batchSize', async () => {
    const processor = createStreamingProcessor<number, number>()
    const sinkBatches: number[][] = []

    const result = await processor.process(
      asyncFrom([1, 2, 3, 4, 5]),
      (n) => n * 2,
      async (batch) => { sinkBatches.push([...batch]) },
      { batchSize: 2 }
    )

    expect(sinkBatches).toEqual([[2, 4], [6, 8], [10]])
    expect(result.totalProcessed).toBe(5)
    expect(result.totalSuccess).toBe(5)
  })

  it('uses default batch size of 100 when no options provided', async () => {
    const processor = createStreamingProcessor<number, number>()
    const items = Array.from({ length: 150 }, (_, i) => i)
    const sinkBatches: number[][] = []

    await processor.process(
      asyncFrom(items),
      (n) => n,
      async (batch) => { sinkBatches.push([...batch]) }
    )

    expect(sinkBatches.length).toBe(2)
    expect(sinkBatches[0].length).toBe(100)
    expect(sinkBatches[1].length).toBe(50)
  })

  it('records errors when transform throws', async () => {
    const processor = createStreamingProcessor<number, number>()
    const sinkBatches: number[][] = []

    const result = await processor.process(
      asyncFrom([1, 2, 3, 4]),
      (n) => {
        if (n === 2 || n === 4) throw new Error(`bad item ${n}`)
        return n
      },
      async (batch) => { sinkBatches.push([...batch]) },
      { batchSize: 10 }
    )

    expect(result.totalProcessed).toBe(4)
    expect(result.totalSuccess).toBe(2)
    expect(result.totalSkipped).toBe(2)
    expect(result.errors).toEqual([
      { item: '2', error: 'bad item 2' },
      { item: '4', error: 'bad item 4' },
    ])
    expect(sinkBatches).toEqual([[1, 3]])
  })

  it('handles empty source', async () => {
    const processor = createStreamingProcessor<number, number>()
    const sink = vi.fn()

    const result = await processor.process(
      asyncFrom([]),
      (n) => n,
      sink,
      { batchSize: 10 }
    )

    expect(result.totalProcessed).toBe(0)
    expect(result.totalSuccess).toBe(0)
    expect(result.totalSkipped).toBe(0)
    expect(result.errors).toEqual([])
    expect(sink).not.toHaveBeenCalled()
  })

  it('applies backpressure by awaiting sink before collecting next batch', async () => {
    const processor = createStreamingProcessor<number, number>()
    const callOrder: string[] = []

    await processor.process(
      asyncFrom([1, 2, 3, 4]),
      (n) => n,
      async (batch) => {
        callOrder.push(`sink-start-${batch[0]}`)
        await new Promise((r) => setTimeout(r, 10))
        callOrder.push(`sink-end-${batch[0]}`)
      },
      { batchSize: 2 }
    )

    // Sink for batch [1,2] must complete before batch [3,4] starts
    expect(callOrder).toEqual([
      'sink-start-1',
      'sink-end-1',
      'sink-start-3',
      'sink-end-3',
    ])
  })

  it('handles all items failing transform', async () => {
    const processor = createStreamingProcessor<number, number>()
    const sink = vi.fn()

    const result = await processor.process(
      asyncFrom([1, 2, 3]),
      () => { throw new Error('fail') },
      sink,
      { batchSize: 10 }
    )

    expect(result.totalProcessed).toBe(3)
    expect(result.totalSuccess).toBe(0)
    expect(result.totalSkipped).toBe(3)
    expect(result.errors.length).toBe(3)
    expect(sink).not.toHaveBeenCalled()
  })
})
