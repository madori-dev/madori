import { NextResponse } from 'next/server'
import { isFeatureEnabled } from '@/lib/ai/middleware'
import { getAiConfig } from '@/lib/ai/schema'
import { createProviderAdapter } from '@/lib/ai/provider/factory'
import { suggestFieldValues } from '@/lib/ai/features/auto-fill'
import type { FieldValue, BlueprintField } from '@/lib/ai/features/auto-fill'
import { FileTokenTracker } from '@/lib/ai/usage/file-tracker'

/**
 * POST /api/ai/auto-fill
 *
 * Suggests values for empty entry fields based on populated fields and blueprint context.
 * Accepts JSON `{ populatedFields: FieldValue[], emptyFields: BlueprintField[] }`.
 *
 * Returns: `{ suggestions, usage }`
 *
 * Satisfies Requirements 9.1, 9.3, 9.4, 13.2.
 */
export async function POST(request: Request) {
  // Feature flag check (Req 13.2)
  if (!isFeatureEnabled('autoFill')) {
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
  let populatedFields: FieldValue[]
  let emptyFields: BlueprintField[]
  try {
    const body = await request.json()
    populatedFields = body.populatedFields
    emptyFields = body.emptyFields

    if (!Array.isArray(populatedFields)) {
      return NextResponse.json(
        { error: 'Validation failed', fields: { populatedFields: 'populatedFields must be an array' } },
        { status: 400 },
      )
    }
    if (!Array.isArray(emptyFields)) {
      return NextResponse.json(
        { error: 'Validation failed', fields: { emptyFields: 'emptyFields must be an array' } },
        { status: 400 },
      )
    }
  } catch {
    return NextResponse.json(
      { error: 'Validation failed', fields: { body: 'Invalid JSON body' } },
      { status: 400 },
    )
  }

  // Create provider and suggest field values
  const provider = createProviderAdapter(config)
  const result = await suggestFieldValues(populatedFields, emptyFields, { provider })

  // Record usage
  await tracker.record({
    operation: 'auto-fill',
    model: config.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  })

  return NextResponse.json({
    suggestions: result.suggestions,
    usage: result.usage,
  })
}
