import { describe, it, expect, vi } from 'vitest'
import {
  generateFromPrompt,
  rewriteText,
  summarizeText,
  continueWriting,
} from '../features/editor'
import type { ProviderAdapter, AiStreamEvent, AiResponse } from '../provider/interface'
import type { EditorAiOptions } from '../features/editor'

/**
 * Creates a mock ProviderAdapter for testing editor AI functions.
 */
function createMockProvider(overrides?: Partial<ProviderAdapter>): ProviderAdapter {
  return {
    generateText: vi.fn().mockResolvedValue({
      text: 'mock response',
      usage: { inputTokens: 10, outputTokens: 20 },
    } satisfies AiResponse),
    streamText: vi.fn().mockReturnValue(
      new ReadableStream<AiStreamEvent>({
        start(controller) {
          controller.enqueue({ type: 'chunk', text: 'streamed ' })
          controller.enqueue({ type: 'chunk', text: 'content' })
          controller.enqueue({ type: 'done', usage: { inputTokens: 5, outputTokens: 15 } })
          controller.close()
        },
      }),
    ),
    generateWithVision: vi.fn().mockResolvedValue({
      text: 'vision response',
      usage: { inputTokens: 50, outputTokens: 30 },
    }),
    generateStructured: vi.fn().mockResolvedValue({
      data: {},
      usage: { inputTokens: 10, outputTokens: 10 },
    }),
    ...overrides,
  }
}

describe('Editor AI: generateFromPrompt', () => {
  it('calls streamText with the user prompt and a system prompt', () => {
    const provider = createMockProvider()
    const options: EditorAiOptions = { provider }

    generateFromPrompt('Write a blog intro about cats', options)

    expect(provider.streamText).toHaveBeenCalledOnce()
    const [prompt, opts] = (provider.streamText as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(prompt).toBe('Write a blog intro about cats')
    expect(opts.systemPrompt).toBeDefined()
    expect(opts.systemPrompt).toContain('writing assistant')
  })

  it('returns a ReadableStream of AiStreamEvents', async () => {
    const provider = createMockProvider()
    const options: EditorAiOptions = { provider }

    const stream = generateFromPrompt('test prompt', options)
    const reader = stream.getReader()
    const events: AiStreamEvent[] = []

    let result = await reader.read()
    while (!result.done) {
      events.push(result.value)
      result = await reader.read()
    }

    expect(events).toHaveLength(3)
    expect(events[0]).toEqual({ type: 'chunk', text: 'streamed ' })
    expect(events[1]).toEqual({ type: 'chunk', text: 'content' })
    expect(events[2]).toEqual({ type: 'done', usage: { inputTokens: 5, outputTokens: 15 } })
  })
})

describe('Editor AI: rewriteText', () => {
  it('calls streamText with the text and mode-specific system prompt', () => {
    const provider = createMockProvider()
    const options: EditorAiOptions = { provider }

    rewriteText('Some text to simplify', 'simplify', options)

    expect(provider.streamText).toHaveBeenCalledOnce()
    const [text, opts] = (provider.streamText as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(text).toBe('Some text to simplify')
    expect(opts.systemPrompt).toContain('simpler language')
  })

  it.each([
    ['tone-shift', 'professional'],
    ['simplify', 'simpler'],
    ['expand', 'Expand'],
    ['shorten', 'Condense'],
  ] as const)('includes appropriate instruction for mode "%s"', (mode, expectedKeyword) => {
    const provider = createMockProvider()
    const options: EditorAiOptions = { provider }

    rewriteText('test', mode, options)

    const [, opts] = (provider.streamText as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(opts.systemPrompt).toContain(expectedKeyword)
  })
})

describe('Editor AI: summarizeText', () => {
  it('calls generateText (non-streaming) and returns summary with usage', async () => {
    const provider = createMockProvider({
      generateText: vi.fn().mockResolvedValue({
        text: 'A concise summary of the content.',
        usage: { inputTokens: 100, outputTokens: 25 },
      }),
    })
    const options: EditorAiOptions = { provider }

    const result = await summarizeText('A long article about various topics...', options)

    expect(provider.generateText).toHaveBeenCalledOnce()
    expect(result.summary).toBe('A concise summary of the content.')
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 25 })
  })

  it('passes a system prompt instructing concise summarization', async () => {
    const provider = createMockProvider()
    const options: EditorAiOptions = { provider }

    await summarizeText('text to summarize', options)

    const [, opts] = (provider.generateText as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(opts.systemPrompt).toContain('concise summary')
  })
})

describe('Editor AI: continueWriting', () => {
  it('calls streamText with preceding content and a continuation system prompt', () => {
    const provider = createMockProvider()
    const options: EditorAiOptions = { provider }

    continueWriting('The quick brown fox jumped over the', options)

    expect(provider.streamText).toHaveBeenCalledOnce()
    const [content, opts] = (provider.streamText as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(content).toBe('The quick brown fox jumped over the')
    expect(opts.systemPrompt).toContain('Continue writing')
  })

  it('returns a ReadableStream', async () => {
    const provider = createMockProvider()
    const options: EditorAiOptions = { provider }

    const stream = continueWriting('preceding text', options)
    expect(stream).toBeInstanceOf(ReadableStream)

    const reader = stream.getReader()
    const { value } = await reader.read()
    expect(value?.type).toBe('chunk')
  })
})
