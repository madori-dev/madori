import { AnthropicAdapter } from './anthropic'
import { OpenAiCompatibleAdapter } from './openai-compatible'
import type { ProviderAdapter } from './interface'
import type { AiConfig } from '../schema'

/**
 * Creates the appropriate provider adapter based on config.
 * Exhaustive switch ensures all provider values are handled at compile time.
 *
 * Satisfies Requirements 2.5, 2.6.
 */
export function createProviderAdapter(config: AiConfig): ProviderAdapter {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicAdapter(config)
    case 'openai-compatible':
      return new OpenAiCompatibleAdapter(config)
  }
}
