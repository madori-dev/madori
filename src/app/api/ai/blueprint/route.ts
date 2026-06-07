import { NextResponse } from 'next/server'
import { isFeatureEnabled } from '@/lib/ai/middleware'
import { getAiConfig } from '@/lib/ai/schema'
import { createProviderAdapter } from '@/lib/ai/provider/factory'
import { generateBlueprint } from '@/lib/ai/features/blueprint'
import { FileTokenTracker } from '@/lib/ai/usage/file-tracker'

/**
 * POST /api/ai/blueprint
 *
 * Generates a Madori blueprint YAML from a natural language description.
 * Returns the generated YAML along with validation status.
 * If validation fails (Req 8.4), still returns 200 with `valid: false` and errors.
 *
 * Satisfies Requirements 8.1, 8.3, 8.4, 13.2.
 */
export async function POST(request: Request) {
  // Feature flag check (Req 13.2)
  if (!isFeatureEnabled('blueprints')) {
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
  let description: string
  try {
    const body = await request.json()
    description = body.description
    if (typeof description !== 'string' || description.trim().length === 0) {
      return NextResponse.json(
        { error: 'Validation failed', fields: { description: 'description must be a non-empty string' } },
        { status: 400 },
      )
    }
  } catch {
    return NextResponse.json(
      { error: 'Validation failed', fields: { description: 'Invalid JSON body' } },
      { status: 400 },
    )
  }

  // Create provider and generate blueprint
  const provider = createProviderAdapter(config)
  const result = await generateBlueprint(description, { provider })

  // Record usage
  await tracker.record({
    operation: 'blueprint',
    model: config.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  })

  // Return 200 regardless of validation status (Req 8.4)
  return NextResponse.json({
    yaml: result.yaml,
    valid: result.valid,
    ...(result.errors && { errors: result.errors }),
    usage: result.usage,
  })
}
