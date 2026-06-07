import { NextResponse } from 'next/server'

import { isAiEnabled } from '@/lib/ai/middleware'
import { McpApiKeyService } from '@/lib/mcp/api-key-service'
import type { McpPermission } from '@/lib/mcp/auth'

/**
 * GET /api/ai/api-keys
 *
 * Lists all API keys (without keyHash for security).
 * Returns 404 if AI is not configured.
 *
 * Satisfies Requirements 15.1, 15.2.
 */
export async function GET() {
  if (!isAiEnabled()) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 404 })
  }

  const service = new McpApiKeyService()
  const keys = await service.listKeys()

  // Strip keyHash from each record for security
  const sanitized = keys.map(({ keyHash: _keyHash, ...rest }) => rest)

  return NextResponse.json(sanitized)
}

/**
 * POST /api/ai/api-keys
 *
 * Creates a new API key with the given label and permissions.
 * Returns the raw key (shown once) and the record.
 * Returns 404 if AI is not configured.
 *
 * Satisfies Requirements 15.2, 15.4.
 */
export async function POST(request: Request) {
  if (!isAiEnabled()) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 404 })
  }

  let body: { label?: string; permissions?: McpPermission[] }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Validation failed', fields: { body: 'Invalid JSON' } },
      { status: 400 },
    )
  }

  if (!body.label || typeof body.label !== 'string' || body.label.trim().length === 0) {
    return NextResponse.json(
      { error: 'Validation failed', fields: { label: 'Label is required' } },
      { status: 400 },
    )
  }

  if (!Array.isArray(body.permissions)) {
    return NextResponse.json(
      { error: 'Validation failed', fields: { permissions: 'Permissions array is required' } },
      { status: 400 },
    )
  }

  const service = new McpApiKeyService()
  const { key, record } = await service.createKey(body.label.trim(), body.permissions)

  // Strip keyHash from the returned record
  const { keyHash: _keyHash, ...sanitizedRecord } = record

  return NextResponse.json({ key, record: sanitizedRecord }, { status: 201 })
}
