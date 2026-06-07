import { NextResponse } from 'next/server'
import { isFeatureEnabled } from '@/lib/ai/middleware'
import { getAiConfig } from '@/lib/ai/schema'
import { createProviderAdapter } from '@/lib/ai/provider/factory'
import { generateMetaDescription } from '@/lib/ai/features/seo'
import { FileTokenTracker } from '@/lib/ai/usage/file-tracker'

/**
 * POST /api/ai/seo/description
 *
 * Generates an SEO meta description (≤160 chars) from the provided content.
 * Satisfies Requirements 6.2, 13.2.
 */
export async function POST(request: Request) {
  // Feature flag check (Req 13.2)
  if (!isFeatureEnabled('seo')) {
    return NextResponse.json({ error: 'Feature disabled' }, { status: 404 })
  }

  // Load AI config
  const config = await getAiConfig()
  if (!config) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 404 })
  }

  // Spend limit check
  const tracker = new FileTokenTracker()
  const limitCheck = await tracker.checkLimit()
  if (!limitCheck.allowed) {
    return NextResponse.json(
      { error: 'Spend limit reached', currentTotal: limitCheck.currentTotal, limit: limitCheck.limit },
      { status: 429 },
    )
  }

  // Parse request body
  let content: string
  try {
    const body = await request.json()
    content = body.content
    if (typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json(
        { error: 'Validation failed', fields: { content: 'content must be a non-empty string' } },
        { status: 400 },
      )
    }
  } catch {
    return NextResponse.json(
      { error: 'Validation failed', fields: { content: 'Invalid JSON body' } },
      { status: 400 },
    )
  }

  // Create provider and generate
  const provider = createProviderAdapter(config)
  const result = await generateMetaDescription(content, { provider })

  // Record usage
  await tracker.record({
    operation: 'seo.description',
    model: config.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  })

  return NextResponse.json({
    text: result.text,
    usage: result.usage,
  })
}
