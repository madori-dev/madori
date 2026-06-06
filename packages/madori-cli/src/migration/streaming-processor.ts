/**
 * Streaming processor for batched async processing with backpressure.
 * Used by both WordPress and Markdown migration commands to handle
 * large datasets without loading all entries into memory simultaneously.
 */

export interface ProcessResult {
  totalProcessed: number
  totalSuccess: number
  totalSkipped: number
  errors: Array<{ item: string; error: string }>
}

export interface StreamingProcessorOptions {
  batchSize: number
}

const DEFAULT_BATCH_SIZE = 100

export interface StreamingProcessor<TInput, TOutput> {
  process(
    source: AsyncIterable<TInput>,
    transform: (item: TInput) => TOutput,
    sink: (batch: TOutput[]) => Promise<void>,
    options?: StreamingProcessorOptions
  ): Promise<ProcessResult>
}

export function createStreamingProcessor<TInput, TOutput>(): StreamingProcessor<TInput, TOutput> {
  return {
    async process(
      source: AsyncIterable<TInput>,
      transform: (item: TInput) => TOutput,
      sink: (batch: TOutput[]) => Promise<void>,
      options?: StreamingProcessorOptions
    ): Promise<ProcessResult> {
      const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE

      const result: ProcessResult = {
        totalProcessed: 0,
        totalSuccess: 0,
        totalSkipped: 0,
        errors: [],
      }

      let batch: TOutput[] = []

      for await (const item of source) {
        result.totalProcessed++

        try {
          const transformed = transform(item)
          batch.push(transformed)
          result.totalSuccess++
        } catch (err) {
          result.totalSkipped++
          result.errors.push({
            item: String(item),
            error: err instanceof Error ? err.message : String(err),
          })
        }

        // Backpressure: flush batch when it reaches batchSize,
        // awaiting sink before collecting more items from source
        if (batch.length >= batchSize) {
          await sink(batch)
          batch = []
        }
      }

      // Flush remaining items
      if (batch.length > 0) {
        await sink(batch)
      }

      return result
    },
  }
}
