import { describe, it, expect } from 'vitest'
import { generateMetaTitle, generateMetaDescription } from '../features/seo'
import type { ProviderAdapter, AiResponse, AiStreamEvent, GenerateOptions } from '../provider/interface'
import { z } from 'zod'

function createMockProvider(responseText: string): ProviderAdapter {
  return {
    async generateText(_prompt: string, _options?: GenerateOptions): Promise<AiResponse> {
      return {
        text: responseText,
        usage: { inputTokens: 10, outputTokens: 5 },
      }
    },
    streamText(_prompt: string, _options?: GenerateOptions): ReadableStream<AiStreamEvent> {
      return new ReadableStream()
    },
    async generateWithVision(_image: Buffer, _prompt: string, _options?: GenerateOptions): Promise<AiResponse> {
      return { text: '', usage: { inputTokens: 0, outputTokens: 0 } }
    },
    async generateStructured<T>(_prompt: string, _schema: z.ZodSchema<T>, _options?: GenerateOptions) {
      return { data: {} as T, usage: { inputTokens: 0, outputTokens: 0 } }
    },
  }
}

describe('generateMetaTitle', () => {
  it('returns text from the provider', async () => {
    const provider = createMockProvider('Best Practices for SEO')
    const result = await generateMetaTitle('Some long article about SEO best practices...', { provider })
    expect(result.text).toBe('Best Practices for SEO')
  })

  it('trims whitespace from provider response', async () => {
    const provider = createMockProvider('  Trimmed Title  ')
    const result = await generateMetaTitle('content', { provider })
    expect(result.text).toBe('Trimmed Title')
  })

  it('truncates text to 60 characters', async () => {
    const longTitle = 'A'.repeat(80)
    const provider = createMockProvider(longTitle)
    const result = await generateMetaTitle('content', { provider })
    expect(result.text.length).toBeLessThanOrEqual(60)
    expect(result.text).toBe('A'.repeat(60))
  })

  it('includes token usage in response', async () => {
    const provider = createMockProvider('Title')
    const result = await generateMetaTitle('content', { provider })
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 })
  })
})

describe('generateMetaDescription', () => {
  it('returns text from the provider', async () => {
    const provider = createMockProvider('A comprehensive guide to improving your SEO rankings.')
    const result = await generateMetaDescription('Long article content...', { provider })
    expect(result.text).toBe('A comprehensive guide to improving your SEO rankings.')
  })

  it('trims whitespace from provider response', async () => {
    const provider = createMockProvider('  Trimmed Description  ')
    const result = await generateMetaDescription('content', { provider })
    expect(result.text).toBe('Trimmed Description')
  })

  it('truncates text to 160 characters', async () => {
    const longDescription = 'B'.repeat(200)
    const provider = createMockProvider(longDescription)
    const result = await generateMetaDescription('content', { provider })
    expect(result.text.length).toBeLessThanOrEqual(160)
    expect(result.text).toBe('B'.repeat(160))
  })

  it('includes token usage in response', async () => {
    const provider = createMockProvider('Description')
    const result = await generateMetaDescription('content', { provider })
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 })
  })
})
