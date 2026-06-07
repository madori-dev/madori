import { NextResponse } from 'next/server'

import { isAiEnabled } from '@/lib/ai/middleware'
import { maskApiKey } from '@/lib/ai/utils'
import { getAiConfig } from '@/lib/ai/schema'

/**
 * GET /api/ai/config
 *
 * Returns the sanitized AI configuration (masked API key).
 * Returns 404 if AI is not configured.
 *
 * Satisfies Requirements 12.1, 3.5.
 */
export async function GET() {
  if (!isAiEnabled()) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 404 })
  }

  const config = await getAiConfig()

  if (!config) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 404 })
  }

  return NextResponse.json({
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    apiKey: maskApiKey(config.apiKey),
    features: config.features,
    spendLimit: config.spendLimit ?? null,
  })
}
