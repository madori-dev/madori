import { z } from 'zod'

/**
 * Token count metadata included in every AI response.
 * Satisfies Requirement 2.7: Token count metadata in every response.
 */
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

/**
 * Complete text response from a provider.
 * Satisfies Requirements 2.1, 2.7.
 */
export interface AiResponse {
  text: string
  usage: TokenUsage
}

/**
 * Streaming event emitted by a provider's SSE stream.
 * - 'chunk': incremental text fragment
 * - 'done': stream completed, includes final token usage
 * - 'error': provider error occurred
 * Satisfies Requirements 2.2, 4.2, 4.3, 4.4.
 */
export interface AiStreamEvent {
  type: 'chunk' | 'done' | 'error'
  text?: string
  usage?: TokenUsage
  error?: string
}

/**
 * Options common to all generation methods.
 */
export interface GenerateOptions {
  systemPrompt?: string
  maxTokens?: number
  temperature?: number
}

/**
 * Shared provider interface with swappable adapters.
 * All AI features interact with this interface — concrete
 * implementations are selected at runtime based on config.
 *
 * Satisfies Requirements 2.1, 2.2, 2.3, 2.4, 2.7.
 */
export interface ProviderAdapter {
  /** Generate a complete text response from a prompt. (Req 2.1) */
  generateText(prompt: string, options?: GenerateOptions): Promise<AiResponse>

  /** Stream text chunks via ReadableStream. (Req 2.2) */
  streamText(prompt: string, options?: GenerateOptions): ReadableStream<AiStreamEvent>

  /** Generate text from an image + prompt using vision capabilities. (Req 2.3) */
  generateWithVision(image: Buffer, prompt: string, options?: GenerateOptions): Promise<AiResponse>

  /** Generate validated structured output from a prompt + Zod schema. (Req 2.4) */
  generateStructured<T>(prompt: string, schema: z.ZodSchema<T>, options?: GenerateOptions): Promise<{ data: T; usage: TokenUsage }>
}
