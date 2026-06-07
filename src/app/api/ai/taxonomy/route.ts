import { NextResponse } from 'next/server'
import { isFeatureEnabled } from '@/lib/ai/middleware'
import { getAiConfig } from '@/lib/ai/schema'
import { createProviderAdapter } from '@/lib/ai/provider/factory'
import { suggestTaxonomyTerms, type TaxonomyTerm } from '@/lib/ai/features/taxonomy'
import { FileTokenTracker } from '@/lib/ai/usage/file-tracker'

/**
 * POST /api/ai/taxonomy
 *
 * Analyzes entry content against existing taxonomy terms and returns
 * ranked suggestions ordered by relevance score descending.
 * Satisfies Requirements 10.1, 10.2, 13.2.
 */
export async function POST(request: Request) {
  // Feature flag check (Req 13.2)
  if (!isFeatureEnabled('taxonomy')) {
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

  // Parse and validate request body
  let content: string
  let existingTerms: TaxonomyTerm[]
  try {
    const body = await request.json()
    content = body.content
    existingTerms = body.existingTerms

    if (typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json(
        { error: 'Validation failed', fields: { content: 'content must be a non-empty string' } },
        { status: 400 },
      )
    }

    if (!Array.isArray(existingTerms)) {
      return NextResponse.json(
        { error: 'Validation failed', fields: { existingTerms: 'existingTerms must be an array' } },
        { status: 400 },
      )
    }

    for (let i = 0; i < existingTerms.length; i++) {
      const term = existingTerms[i]
      if (
        typeof term !== 'object' ||
        term === null ||
        typeof term.handle !== 'string' ||
        typeof term.title !== 'string'
      ) {
        return NextResponse.json(
          {
            error: 'Validation failed',
            fields: { existingTerms: `existingTerms[${i}] must have string "handle" and "title" properties` },
          },
          { status: 400 },
        )
      }
    }
  } catch {
    return NextResponse.json(
      { error: 'Validation failed', fields: { body: 'Invalid JSON body' } },
      { status: 400 },
    )
  }

  // Create provider and generate suggestions
  const provider = createProviderAdapter(config)
  const result = await suggestTaxonomyTerms(content, existingTerms, { provider })

  // Record usage
  await tracker.record({
    operation: 'taxonomy',
    model: config.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  })

  return NextResponse.json({
    suggestions: result.suggestions,
    usage: result.usage,
  })
}
