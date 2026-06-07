import type { AiStreamEvent } from '../provider/interface'

/**
 * Converts an AiStreamEvent to standard SSE format: `data: <valid-json>\n\n`
 *
 * Satisfies Requirements 4.2, 4.3.
 */
export function formatSseEvent(event: AiStreamEvent): string {
  const payload: Record<string, unknown> = { type: event.type }

  switch (event.type) {
    case 'chunk':
      payload.text = event.text ?? ''
      break
    case 'done':
      payload.usage = event.usage ?? { inputTokens: 0, outputTokens: 0 }
      break
    case 'error':
      payload.error = event.error ?? 'Unknown error'
      break
  }

  return `data: ${JSON.stringify(payload)}\n\n`
}

/**
 * Transforms a ReadableStream<AiStreamEvent> from a provider adapter into
 * a ReadableStream<Uint8Array> suitable for a Next.js Route Handler Response.
 *
 * Each AiStreamEvent is formatted as SSE text and encoded as UTF-8 bytes.
 * On error mid-stream (Req 4.4): emits an error event and closes.
 *
 * Satisfies Requirements 4.1, 4.2, 4.3, 4.4.
 */
export function createSseStream(providerStream: ReadableStream<AiStreamEvent>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const reader = providerStream.getReader()

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()

        if (done) {
          controller.close()
          return
        }

        const sseText = formatSseEvent(value)
        controller.enqueue(encoder.encode(sseText))

        // If the event itself is an error, close after emitting
        if (value.type === 'error') {
          controller.close()
        }
      } catch (err) {
        // Mid-stream error (Req 4.4): emit error event and close
        const errorEvent: AiStreamEvent = {
          type: 'error',
          error: err instanceof Error ? err.message : 'Stream failed',
        }
        const sseText = formatSseEvent(errorEvent)
        controller.enqueue(encoder.encode(sseText))
        controller.close()
      }
    },

    cancel() {
      reader.cancel()
    },
  })
}
