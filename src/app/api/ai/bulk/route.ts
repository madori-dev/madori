import { NextResponse } from 'next/server'
import { isFeatureEnabled } from '@/lib/ai/middleware'
import { getAiConfig } from '@/lib/ai/schema'
import { createProviderAdapter } from '@/lib/ai/provider/factory'
import { FileTokenTracker } from '@/lib/ai/usage/file-tracker'
import {
  processBulk,
  type BulkOperationType,
  type BulkEntry,
  type BulkProgressEvent,
} from '@/lib/ai/features/bulk'

/**
 * Bulk operation streaming route.
 *
 * POST handler that accepts a bulk operation type and entries array,
 * processes them via the bulk processor, and streams progress events
 * back to the client as SSE.
 *
 * Satisfies Requirements 11.1, 11.2, 11.5, 13.2.
 */
export async function POST(request: Request) {
  // Feature flag check (Req 13.2)
  if (!isFeatureEnabled('bulk')) {
    return NextResponse.json({ error: 'Feature disabled' }, { status: 404 })
  }

  // Load AI config
  const aiConfig = await getAiConfig()
  if (!aiConfig) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 404 })
  }

  // Spend limit check (Req 11.5 — initial check; bulk processor also checks per-entry)
  const tracker = new FileTokenTracker()
  const limitCheck = await tracker.checkLimit()
  if (!limitCheck.allowed) {
    return NextResponse.json(
      { error: 'Spend limit reached', currentTotal: limitCheck.currentTotal, limit: limitCheck.limit },
      { status: 429 },
    )
  }

  // Parse request body
  let body: { operation?: string; entries?: unknown[] }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Validation failed', fields: { body: 'Invalid JSON' } },
      { status: 400 },
    )
  }

  // Validate operation
  const validOperations: BulkOperationType[] = ['generate-meta-descriptions']
  if (!body.operation || !validOperations.includes(body.operation as BulkOperationType)) {
    return NextResponse.json(
      { error: 'Validation failed', fields: { operation: 'Must be one of: generate-meta-descriptions' } },
      { status: 400 },
    )
  }

  // Validate entries
  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return NextResponse.json(
      { error: 'Validation failed', fields: { entries: 'Must be a non-empty array' } },
      { status: 400 },
    )
  }

  const entries = body.entries as BulkEntry[]

  // Validate each entry has required fields
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (!entry.id || !entry.collection || !entry.content) {
      return NextResponse.json(
        { error: 'Validation failed', fields: { [`entries[${i}]`]: 'Each entry must have id, collection, and content' } },
        { status: 400 },
      )
    }
  }

  const operation = body.operation as BulkOperationType

  // Create provider adapter
  const provider = createProviderAdapter(aiConfig)

  // Create SSE stream that emits progress events from the bulk processor
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      processBulk(operation, entries, {
        provider,
        tracker,
        onProgress(event: BulkProgressEvent) {
          const sseData = `data: ${JSON.stringify(event)}\n\n`
          controller.enqueue(encoder.encode(sseData))
        },
      })
        .then(() => {
          controller.close()
        })
        .catch((err) => {
          const errorEvent: BulkProgressEvent = {
            type: 'error',
            completed: 0,
            total: entries.length,
            errors: 1,
            error: err instanceof Error ? err.message : 'Bulk processing failed',
          }
          const sseData = `data: ${JSON.stringify(errorEvent)}\n\n`
          controller.enqueue(encoder.encode(sseData))
          controller.close()
        })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
