import { NextResponse } from 'next/server'
import { isFeatureEnabled } from '@/lib/ai/middleware'
import { getAiConfig } from '@/lib/ai/schema'
import { createProviderAdapter } from '@/lib/ai/provider/factory'
import { createSseStream } from '@/lib/ai/streaming/sse'
import { FileTokenTracker } from '@/lib/ai/usage/file-tracker'
import {
  generateFromPrompt,
  rewriteText,
  summarizeText,
  continueWriting,
  type RewriteMode,
} from '@/lib/ai/features/editor'

/**
 * Editor AI streaming route.
 *
 * POST handler that dispatches to the appropriate editor AI function
 * based on the `action` field in the request body.
 *
 * Streaming operations (generate, rewrite, continue) return SSE responses.
 * Non-streaming operations (summarize) return JSON responses.
 *
 * Satisfies Requirements 4.1, 4.5, 5.1, 5.2, 5.3, 5.4, 13.2.
 */
export async function POST(request: Request) {
  // Feature flag check (Req 13.2)
  if (!isFeatureEnabled('editor')) {
    return NextResponse.json({ error: 'Feature disabled' }, { status: 404 })
  }

  // Load AI config
  const aiConfig = await getAiConfig()
  if (!aiConfig) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 404 })
  }

  // Spend limit check (Req 3.3, 3.4)
  const tracker = new FileTokenTracker()
  const limitCheck = await tracker.checkLimit()
  if (!limitCheck.allowed) {
    return NextResponse.json(
      { error: 'Spend limit reached', currentTotal: limitCheck.currentTotal, limit: limitCheck.limit },
      { status: 429 },
    )
  }

  // Parse request body
  let body: {
    action: string
    prompt?: string
    text?: string
    mode?: RewriteMode
    precedingContent?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Validation failed', fields: { body: 'Invalid JSON' } },
      { status: 400 },
    )
  }

  const { action, prompt, text, mode, precedingContent } = body

  if (!action || !['generate', 'rewrite', 'summarize', 'continue'].includes(action)) {
    return NextResponse.json(
      { error: 'Validation failed', fields: { action: 'Must be one of: generate, rewrite, summarize, continue' } },
      { status: 400 },
    )
  }

  // Create provider adapter
  const provider = createProviderAdapter(aiConfig)

  // Dispatch to the appropriate editor AI function
  switch (action) {
    case 'generate': {
      if (!prompt) {
        return NextResponse.json(
          { error: 'Validation failed', fields: { prompt: 'Required for generate action' } },
          { status: 400 },
        )
      }

      const stream = generateFromPrompt(prompt, { provider })
      const sseStream = createSseStream(stream)

      return new Response(sseStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }

    case 'rewrite': {
      if (!text) {
        return NextResponse.json(
          { error: 'Validation failed', fields: { text: 'Required for rewrite action' } },
          { status: 400 },
        )
      }

      const rewriteMode: RewriteMode = mode ?? 'tone-shift'
      const stream = rewriteText(text, rewriteMode, { provider })
      const sseStream = createSseStream(stream)

      return new Response(sseStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }

    case 'summarize': {
      if (!text) {
        return NextResponse.json(
          { error: 'Validation failed', fields: { text: 'Required for summarize action' } },
          { status: 400 },
        )
      }

      const result = await summarizeText(text, { provider })

      // Record usage for non-streaming operations
      await tracker.record({
        operation: 'editor.summarize',
        model: aiConfig.model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      })

      return NextResponse.json({ summary: result.summary, usage: result.usage })
    }

    case 'continue': {
      if (!precedingContent) {
        return NextResponse.json(
          { error: 'Validation failed', fields: { precedingContent: 'Required for continue action' } },
          { status: 400 },
        )
      }

      const stream = continueWriting(precedingContent, { provider })
      const sseStream = createSseStream(stream)

      return new Response(sseStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }

    default:
      return NextResponse.json(
        { error: 'Validation failed', fields: { action: 'Unknown action' } },
        { status: 400 },
      )
  }
}
