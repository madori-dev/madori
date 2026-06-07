import { NextResponse } from 'next/server'

import { isAiEnabled } from '@/lib/ai/middleware'
import { McpApiKeyService } from '@/lib/mcp/api-key-service'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * PATCH /api/ai/api-keys/[id]
 *
 * Revokes an API key by ID.
 * Returns 404 if AI is not configured or key not found.
 *
 * Satisfies Requirements 15.5.
 */
export async function PATCH(_request: Request, { params }: RouteParams) {
  if (!isAiEnabled()) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 404 })
  }

  const { id } = await params
  const service = new McpApiKeyService()

  try {
    await service.revokeKey(id)
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 })
    }
    throw error
  }

  return NextResponse.json({ revoked: true })
}

/**
 * DELETE /api/ai/api-keys/[id]
 *
 * Deletes an API key by ID.
 * Returns 404 if AI is not configured or key not found.
 *
 * Satisfies Requirements 15.1.
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  if (!isAiEnabled()) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 404 })
  }

  const { id } = await params
  const service = new McpApiKeyService()

  try {
    await service.deleteKey(id)
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 })
    }
    throw error
  }

  return NextResponse.json({ deleted: true })
}
