import { describe, it, expect, vi } from 'vitest'
import { generateAltText } from '../features/alt-text'
import type { ProviderAdapter, AiResponse } from '../provider/interface'

function createMockProvider(overrides?: Partial<ProviderAdapter>): ProviderAdapter {
  return {
    generateText: vi.fn(),
    streamText: vi.fn(),
    generateWithVision: vi.fn().mockResolvedValue({
      text: 'A golden retriever playing fetch in a park',
      usage: { inputTokens: 200, outputTokens: 12 },
    } satisfies AiResponse),
    generateStructured: vi.fn(),
    ...overrides,
  }
}

describe('generateAltText', () => {
  const testImage = Buffer.from('fake-image-data')

  it('returns alt text and token usage from the vision API', async () => {
    const provider = createMockProvider()
    const result = await generateAltText(testImage, { provider })

    expect(result.altText).toBe('A golden retriever playing fetch in a park')
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 12 })
  })

  it('passes the image buffer and a prompt to generateWithVision', async () => {
    const provider = createMockProvider()
    await generateAltText(testImage, { provider })

    expect(provider.generateWithVision).toHaveBeenCalledWith(
      testImage,
      expect.stringContaining('alt text'),
      expect.objectContaining({ maxTokens: 100, temperature: 0.3 }),
    )
  })

  it('trims whitespace from the generated alt text', async () => {
    const provider = createMockProvider({
      generateWithVision: vi.fn().mockResolvedValue({
        text: '  A cat sitting on a windowsill  \n',
        usage: { inputTokens: 180, outputTokens: 10 },
      }),
    })

    const result = await generateAltText(testImage, { provider })
    expect(result.altText).toBe('A cat sitting on a windowsill')
  })

  it('wraps vision-unsupported errors with a clear message', async () => {
    const provider = createMockProvider({
      generateWithVision: vi.fn().mockRejectedValue(
        new Error('Vision capabilities are not supported for this model'),
      ),
    })

    await expect(generateAltText(testImage, { provider })).rejects.toThrow(
      /Vision is not supported by the current provider configuration/,
    )
  })

  it('wraps generic provider errors with context', async () => {
    const provider = createMockProvider({
      generateWithVision: vi.fn().mockRejectedValue(
        new Error('Rate limit exceeded'),
      ),
    })

    await expect(generateAltText(testImage, { provider })).rejects.toThrow(
      /Failed to generate alt text: Rate limit exceeded/,
    )
  })
})
