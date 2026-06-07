import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { isAiEnabled } from '@/lib/ai/middleware'
import { FileTokenTracker } from '@/lib/ai/usage/file-tracker'
import type { AiOperationType } from '@/lib/ai/usage/tracker'

/**
 * GET /api/ai/usage
 *
 * Returns token usage data. Supports optional query parameters:
 * - groupBy: 'operation' | 'date' | 'both' — returns aggregated data
 * - from: ISO date string — filter records from this date
 * - to: ISO date string — filter records up to this date
 * - operation: AiOperationType — filter by operation type
 *
 * If groupBy is specified, returns aggregated data via tracker.getAggregated().
 * Otherwise returns raw usage records via tracker.getUsage().
 * Always includes spend limit status.
 *
 * Returns 404 if AI is not configured.
 *
 * Satisfies Requirements 12.2, 3.5.
 */
export async function GET(request: NextRequest) {
  if (!isAiEnabled()) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 404 })
  }

  const tracker = new FileTokenTracker()
  const { searchParams } = request.nextUrl

  const groupBy = searchParams.get('groupBy') as 'operation' | 'date' | 'both' | null
  const from = searchParams.get('from') ?? undefined
  const to = searchParams.get('to') ?? undefined
  const operation = searchParams.get('operation') as AiOperationType | null

  const limitStatus = await tracker.checkLimit()

  if (groupBy) {
    const aggregated = await tracker.getAggregated(groupBy)
    return NextResponse.json({
      data: aggregated,
      limit: limitStatus,
    })
  }

  const records = await tracker.getUsage({
    from,
    to,
    operation: operation ?? undefined,
  })

  return NextResponse.json({
    data: records,
    limit: limitStatus,
  })
}
