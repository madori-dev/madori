/**
 * Editor AI feature module — TipTap AI operations.
 *
 * Provides four AI operations for the content editor:
 * - generate: free-text prompt → streamed text (Req 5.1)
 * - rewrite: selected text + mode → streamed replacement (Req 5.2)
 * - summarize: selected text → concise summary (Req 5.3)
 * - continue: preceding content → streamed continuation (Req 5.4)
 *
 * Satisfies Requirements 5.1, 5.2, 5.3, 5.4.
 */

import type { ProviderAdapter, AiStreamEvent, TokenUsage } from '../provider/interface'

/**
 * Available rewrite modes for the rewrite operation.
 */
export type RewriteMode = 'tone-shift' | 'simplify' | 'expand' | 'shorten'

/**
 * Options required for all editor AI operations.
 */
export interface EditorAiOptions {
  provider: ProviderAdapter
}

/**
 * Generates text from a free-text prompt, streamed as AiStreamEvents.
 *
 * Satisfies Requirement 5.1.
 */
export function generateFromPrompt(
  prompt: string,
  options: EditorAiOptions,
): ReadableStream<AiStreamEvent> {
  const systemPrompt =
    'You are a helpful writing assistant integrated into a content editor. ' +
    'Generate clear, well-structured content based on the user\'s prompt. ' +
    'Output only the generated text with no preamble or explanation.'

  return options.provider.streamText(prompt, { systemPrompt })
}

/**
 * Rewrites selected text according to the specified mode, streamed.
 *
 * Satisfies Requirement 5.2.
 */
export function rewriteText(
  text: string,
  mode: RewriteMode,
  options: EditorAiOptions,
): ReadableStream<AiStreamEvent> {
  const modeInstructions: Record<RewriteMode, string> = {
    'tone-shift': 'Rewrite the following text with a more professional and polished tone, preserving the original meaning.',
    'simplify': 'Rewrite the following text in simpler language, making it easier to understand while preserving the core meaning.',
    'expand': 'Expand the following text with more detail, examples, and explanation while maintaining the original message.',
    'shorten': 'Condense the following text to be more concise while retaining all key information.',
  }

  const systemPrompt =
    'You are a writing assistant integrated into a content editor. ' +
    `${modeInstructions[mode]} ` +
    'Output only the rewritten text with no preamble or explanation.'

  return options.provider.streamText(text, { systemPrompt })
}

/**
 * Summarizes selected text and returns the summary with usage metadata.
 *
 * Uses generateText (non-streaming) since summaries are typically short.
 *
 * Satisfies Requirement 5.3.
 */
export async function summarizeText(
  text: string,
  options: EditorAiOptions,
): Promise<{ summary: string; usage: TokenUsage }> {
  const systemPrompt =
    'You are a writing assistant integrated into a content editor. ' +
    'Generate a concise summary of the provided text. ' +
    'The summary should capture the key points in 1-3 sentences. ' +
    'Output only the summary with no preamble or explanation.'

  const response = await options.provider.generateText(text, { systemPrompt })

  return {
    summary: response.text,
    usage: response.usage,
  }
}

/**
 * Continues writing from the preceding content, streamed.
 *
 * Satisfies Requirement 5.4.
 */
export function continueWriting(
  precedingContent: string,
  options: EditorAiOptions,
): ReadableStream<AiStreamEvent> {
  const systemPrompt =
    'You are a writing assistant integrated into a content editor. ' +
    'Continue writing from where the provided text leaves off. ' +
    'Match the style, tone, and structure of the preceding content. ' +
    'Output only the continuation with no preamble or explanation.'

  return options.provider.streamText(precedingContent, { systemPrompt })
}
