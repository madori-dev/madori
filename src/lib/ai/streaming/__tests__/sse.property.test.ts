import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { formatSseEvent } from '../sse'
import type { AiStreamEvent } from '../../provider/interface'

/**
 * Property 7: SSE events conform to standard format
 * **Validates: Requirements 4.2, 4.3**
 *
 * For any AiStreamEvent, formatSseEvent SHALL produce `data: <valid-json>\n\n`.
 */
describe('Property 7: SSE events conform to standard format', () => {
  // Arbitraries for each event type
  const chunkEvent: fc.Arbitrary<AiStreamEvent> = fc.string().map((text) => ({
    type: 'chunk' as const,
    text,
  }))

  const doneEvent: fc.Arbitrary<AiStreamEvent> = fc.record({
    inputTokens: fc.nat(),
    outputTokens: fc.nat(),
  }).map((usage) => ({
    type: 'done' as const,
    usage,
  }))

  const errorEvent: fc.Arbitrary<AiStreamEvent> = fc.string().map((error) => ({
    type: 'error' as const,
    error,
  }))

  const anyEvent: fc.Arbitrary<AiStreamEvent> = fc.oneof(chunkEvent, doneEvent, errorEvent)

  it('chunk events: output starts with "data: " and ends with "\\n\\n"', () => {
    fc.assert(
      fc.property(chunkEvent, (event) => {
        const result = formatSseEvent(event)
        expect(result.startsWith('data: ')).toBe(true)
        expect(result.endsWith('\n\n')).toBe(true)
      }),
      { numRuns: 200 },
    )
  })

  it('done events: output starts with "data: " and ends with "\\n\\n"', () => {
    fc.assert(
      fc.property(doneEvent, (event) => {
        const result = formatSseEvent(event)
        expect(result.startsWith('data: ')).toBe(true)
        expect(result.endsWith('\n\n')).toBe(true)
      }),
      { numRuns: 200 },
    )
  })

  it('error events: output starts with "data: " and ends with "\\n\\n"', () => {
    fc.assert(
      fc.property(errorEvent, (event) => {
        const result = formatSseEvent(event)
        expect(result.startsWith('data: ')).toBe(true)
        expect(result.endsWith('\n\n')).toBe(true)
      }),
      { numRuns: 200 },
    )
  })

  it('all event types: content between "data: " and "\\n\\n" is always valid JSON', () => {
    fc.assert(
      fc.property(anyEvent, (event) => {
        const result = formatSseEvent(event)
        const jsonStr = result.slice('data: '.length, -2) // strip prefix and trailing \n\n
        expect(() => JSON.parse(jsonStr)).not.toThrow()
      }),
      { numRuns: 300 },
    )
  })

  it('parsed JSON always contains a "type" field matching the event type', () => {
    fc.assert(
      fc.property(anyEvent, (event) => {
        const result = formatSseEvent(event)
        const jsonStr = result.slice('data: '.length, -2)
        const parsed = JSON.parse(jsonStr)
        expect(parsed.type).toBe(event.type)
      }),
      { numRuns: 300 },
    )
  })

  it('chunk events always have a "text" field in parsed JSON', () => {
    fc.assert(
      fc.property(chunkEvent, (event) => {
        const result = formatSseEvent(event)
        const jsonStr = result.slice('data: '.length, -2)
        const parsed = JSON.parse(jsonStr)
        expect(parsed).toHaveProperty('text')
        expect(typeof parsed.text).toBe('string')
      }),
      { numRuns: 200 },
    )
  })

  it('done events always have a "usage" field in parsed JSON', () => {
    fc.assert(
      fc.property(doneEvent, (event) => {
        const result = formatSseEvent(event)
        const jsonStr = result.slice('data: '.length, -2)
        const parsed = JSON.parse(jsonStr)
        expect(parsed).toHaveProperty('usage')
        expect(typeof parsed.usage).toBe('object')
        expect(parsed.usage).toHaveProperty('inputTokens')
        expect(parsed.usage).toHaveProperty('outputTokens')
      }),
      { numRuns: 200 },
    )
  })

  it('error events always have an "error" field in parsed JSON', () => {
    fc.assert(
      fc.property(errorEvent, (event) => {
        const result = formatSseEvent(event)
        const jsonStr = result.slice('data: '.length, -2)
        const parsed = JSON.parse(jsonStr)
        expect(parsed).toHaveProperty('error')
        expect(typeof parsed.error).toBe('string')
      }),
      { numRuns: 200 },
    )
  })
})
