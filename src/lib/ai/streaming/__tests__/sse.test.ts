import { describe, it, expect } from 'vitest'
import { formatSseEvent, createSseStream } from '../sse'
import type { AiStreamEvent } from '../../provider/interface'

describe('formatSseEvent', () => {
  it('formats a chunk event as SSE data line with valid JSON', () => {
    const event: AiStreamEvent = { type: 'chunk', text: 'hello' }
    const result = formatSseEvent(event)
    expect(result).toBe('data: {"type":"chunk","text":"hello"}\n\n')
  })

  it('formats a chunk event with empty text when text is undefined', () => {
    const event: AiStreamEvent = { type: 'chunk' }
    const result = formatSseEvent(event)
    expect(result).toBe('data: {"type":"chunk","text":""}\n\n')
  })

  it('formats a done event with usage metadata', () => {
    const event: AiStreamEvent = {
      type: 'done',
      usage: { inputTokens: 100, outputTokens: 50 },
    }
    const result = formatSseEvent(event)
    expect(result).toBe('data: {"type":"done","usage":{"inputTokens":100,"outputTokens":50}}\n\n')
  })

  it('formats a done event with default usage when usage is undefined', () => {
    const event: AiStreamEvent = { type: 'done' }
    const result = formatSseEvent(event)
    expect(result).toBe('data: {"type":"done","usage":{"inputTokens":0,"outputTokens":0}}\n\n')
  })

  it('formats an error event', () => {
    const event: AiStreamEvent = { type: 'error', error: 'connection lost' }
    const result = formatSseEvent(event)
    expect(result).toBe('data: {"type":"error","error":"connection lost"}\n\n')
  })

  it('formats an error event with default message when error is undefined', () => {
    const event: AiStreamEvent = { type: 'error' }
    const result = formatSseEvent(event)
    expect(result).toBe('data: {"type":"error","error":"Unknown error"}\n\n')
  })

  it('always ends with double newline', () => {
    const events: AiStreamEvent[] = [
      { type: 'chunk', text: 'test' },
      { type: 'done', usage: { inputTokens: 1, outputTokens: 2 } },
      { type: 'error', error: 'fail' },
    ]
    for (const event of events) {
      expect(formatSseEvent(event)).toMatch(/\n\n$/)
    }
  })

  it('always starts with "data: "', () => {
    const events: AiStreamEvent[] = [
      { type: 'chunk', text: 'test' },
      { type: 'done', usage: { inputTokens: 1, outputTokens: 2 } },
      { type: 'error', error: 'fail' },
    ]
    for (const event of events) {
      expect(formatSseEvent(event)).toMatch(/^data: /)
    }
  })

  it('produces valid JSON between "data: " prefix and trailing newlines', () => {
    const event: AiStreamEvent = { type: 'chunk', text: 'special chars: "quotes" & <brackets>' }
    const result = formatSseEvent(event)
    const jsonStr = result.replace(/^data: /, '').replace(/\n\n$/, '')
    expect(() => JSON.parse(jsonStr)).not.toThrow()
  })
})

describe('createSseStream', () => {
  function makeProviderStream(events: AiStreamEvent[]): ReadableStream<AiStreamEvent> {
    return new ReadableStream<AiStreamEvent>({
      start(controller) {
        for (const event of events) {
          controller.enqueue(event)
        }
        controller.close()
      },
    })
  }

  async function collectStream(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let result = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      result += decoder.decode(value)
    }
    return result
  }

  it('transforms AiStreamEvents into UTF-8 encoded SSE text', async () => {
    const events: AiStreamEvent[] = [
      { type: 'chunk', text: 'Hello' },
      { type: 'chunk', text: ' world' },
      { type: 'done', usage: { inputTokens: 10, outputTokens: 5 } },
    ]
    const stream = createSseStream(makeProviderStream(events))
    const output = await collectStream(stream)

    expect(output).toContain('data: {"type":"chunk","text":"Hello"}\n\n')
    expect(output).toContain('data: {"type":"chunk","text":" world"}\n\n')
    expect(output).toContain('data: {"type":"done","usage":{"inputTokens":10,"outputTokens":5}}\n\n')
  })

  it('closes the stream after emitting an error event', async () => {
    const events: AiStreamEvent[] = [
      { type: 'chunk', text: 'partial' },
      { type: 'error', error: 'provider timeout' },
      { type: 'chunk', text: 'should not appear' },
    ]
    const stream = createSseStream(makeProviderStream(events))
    const output = await collectStream(stream)

    expect(output).toContain('data: {"type":"chunk","text":"partial"}\n\n')
    expect(output).toContain('data: {"type":"error","error":"provider timeout"}\n\n')
    expect(output).not.toContain('should not appear')
  })

  it('emits error event and closes on mid-stream exception (Req 4.4)', async () => {
    let pullCount = 0
    const errorStream = new ReadableStream<AiStreamEvent>({
      pull(controller) {
        pullCount++
        if (pullCount === 1) {
          controller.enqueue({ type: 'chunk', text: 'before error' })
        } else {
          throw new Error('connection reset')
        }
      },
    })

    const stream = createSseStream(errorStream)
    const output = await collectStream(stream)

    expect(output).toContain('data: {"type":"chunk","text":"before error"}\n\n')
    expect(output).toContain('data: {"type":"error","error":"connection reset"}\n\n')
  })

  it('handles an empty provider stream gracefully', async () => {
    const stream = createSseStream(makeProviderStream([]))
    const output = await collectStream(stream)
    expect(output).toBe('')
  })

  it('returns a ReadableStream<Uint8Array>', () => {
    const stream = createSseStream(makeProviderStream([]))
    expect(stream).toBeInstanceOf(ReadableStream)
  })
})
