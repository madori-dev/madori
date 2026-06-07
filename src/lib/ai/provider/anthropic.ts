import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type {
  AiResponse,
  AiStreamEvent,
  GenerateOptions,
  ProviderAdapter,
  TokenUsage,
} from './interface'
import type { AiConfig } from '../schema'

/**
 * Anthropic provider adapter using the native Anthropic SDK.
 * Satisfies Requirements 2.5, 2.7.
 */
export class AnthropicAdapter implements ProviderAdapter {
  private client: Anthropic
  private model: string

  constructor(config: AiConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    })
    this.model = config.model
  }

  async generateText(prompt: string, options?: GenerateOptions): Promise<AiResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature,
      ...(options?.systemPrompt ? { system: options.systemPrompt } : {}),
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')

    const usage: TokenUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    }

    return { text, usage }
  }

  streamText(prompt: string, options?: GenerateOptions): ReadableStream<AiStreamEvent> {
    const client = this.client
    const model = this.model

    return new ReadableStream<AiStreamEvent>({
      async start(controller) {
        try {
          const stream = client.messages.stream({
            model,
            max_tokens: options?.maxTokens ?? 4096,
            temperature: options?.temperature,
            ...(options?.systemPrompt ? { system: options.systemPrompt } : {}),
            messages: [{ role: 'user', content: prompt }],
          })

          stream.on('text', (text) => {
            controller.enqueue({ type: 'chunk', text })
          })

          const finalMessage = await stream.finalMessage()

          const usage: TokenUsage = {
            inputTokens: finalMessage.usage.input_tokens,
            outputTokens: finalMessage.usage.output_tokens,
          }

          controller.enqueue({ type: 'done', usage })
          controller.close()
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown streaming error'
          controller.enqueue({ type: 'error', error: errorMessage })
          controller.close()
        }
      },
    })
  }

  async generateWithVision(
    image: Buffer,
    prompt: string,
    options?: GenerateOptions,
  ): Promise<AiResponse> {
    const base64Image = image.toString('base64')

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature,
      ...(options?.systemPrompt ? { system: options.systemPrompt } : {}),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    })

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')

    const usage: TokenUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    }

    return { text, usage }
  }

  async generateStructured<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options?: GenerateOptions,
  ): Promise<{ data: T; usage: TokenUsage }> {
    const systemPrompt = [
      options?.systemPrompt,
      'You must respond with valid JSON only. No markdown, no code fences, no explanation — just the JSON object.',
    ]
      .filter(Boolean)
      .join('\n\n')

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')

    const usage: TokenUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    }

    // Extract JSON from the response — handle cases where the model
    // wraps its output in markdown code fences despite instructions.
    const jsonStr = extractJson(text)
    const parsed = JSON.parse(jsonStr)
    const data = schema.parse(parsed) as T

    return { data, usage }
  }
}

/**
 * Extract a JSON string from text that may contain markdown code fences.
 */
function extractJson(text: string): string {
  const trimmed = text.trim()

  // Try stripping markdown code fences
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/)
  if (fenceMatch) {
    return fenceMatch[1].trim()
  }

  return trimmed
}
