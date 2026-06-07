import OpenAI from 'openai'
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
 * OpenAI-compatible provider adapter.
 * Connects to any OpenAI-compatible endpoint (OpenAI, Ollama, local models, etc.)
 * using the configured baseUrl.
 *
 * Satisfies Requirements 1.5, 2.6, 2.7.
 */
export class OpenAiCompatibleAdapter implements ProviderAdapter {
  private client: OpenAI

  constructor(private readonly config: AiConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    })
  }

  async generateText(prompt: string, options?: GenerateOptions): Promise<AiResponse> {
    const messages = this.buildMessages(prompt, options?.systemPrompt)

    const response = await this.client.chat.completions.create({
      model: this.config.model,
      messages,
      max_tokens: options?.maxTokens,
      temperature: options?.temperature,
    })

    const text = response.choices[0]?.message?.content ?? ''
    const usage = this.extractUsage(response.usage)

    return { text, usage }
  }

  streamText(prompt: string, options?: GenerateOptions): ReadableStream<AiStreamEvent> {
    const messages = this.buildMessages(prompt, options?.systemPrompt)

    return new ReadableStream<AiStreamEvent>({
      start: async (controller) => {
        try {
          const stream = await this.client.chat.completions.create({
            model: this.config.model,
            messages,
            max_tokens: options?.maxTokens,
            temperature: options?.temperature,
            stream: true,
            stream_options: { include_usage: true },
          })

          let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 }

          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content
            if (delta) {
              controller.enqueue({ type: 'chunk', text: delta })
            }

            // Usage arrives in the final chunk when stream_options.include_usage is set
            if (chunk.usage) {
              usage = this.extractUsage(chunk.usage)
            }
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
    const messages: OpenAI.ChatCompletionMessageParam[] = []

    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt })
    }

    messages.push({
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${base64Image}`,
          },
        },
        {
          type: 'text',
          text: prompt,
        },
      ],
    })

    const response = await this.client.chat.completions.create({
      model: this.config.model,
      messages,
      max_tokens: options?.maxTokens,
      temperature: options?.temperature,
    })

    const text = response.choices[0]?.message?.content ?? ''
    const usage = this.extractUsage(response.usage)

    return { text, usage }
  }

  async generateStructured<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options?: GenerateOptions,
  ): Promise<{ data: T; usage: TokenUsage }> {
    const systemPrompt = [
      options?.systemPrompt,
      'You MUST respond with valid JSON only. No markdown, no explanation, no extra text.',
    ]
      .filter(Boolean)
      .join('\n\n')

    const messages = this.buildMessages(prompt, systemPrompt)

    const response = await this.client.chat.completions.create({
      model: this.config.model,
      messages,
      max_tokens: options?.maxTokens,
      temperature: options?.temperature ?? 0,
      response_format: { type: 'json_object' },
    })

    const rawText = response.choices[0]?.message?.content ?? '{}'
    const usage = this.extractUsage(response.usage)

    const parsed = JSON.parse(rawText)
    const data = schema.parse(parsed)

    return { data, usage }
  }

  private buildMessages(
    prompt: string,
    systemPrompt?: string,
  ): OpenAI.ChatCompletionMessageParam[] {
    const messages: OpenAI.ChatCompletionMessageParam[] = []

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }

    messages.push({ role: 'user', content: prompt })

    return messages
  }

  private extractUsage(usage?: OpenAI.CompletionUsage | null): TokenUsage {
    return {
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    }
  }
}
