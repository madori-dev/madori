import { NextRequest, NextResponse } from 'next/server'
import { CollectionConfigSchema } from '@/lib/config/schema'
import type { ConfigWriter } from '@/lib/config/writer'
import type { MadoriContentEngine } from '@/lib/content/engine'
import type { BlueprintRegistry } from '@/lib/blueprints/registry'
import { DefinitionLoader } from '@/lib/definitions/loader'

export function createCollectionHandlers(
  contentEngine: MadoriContentEngine,
  configWriter: ConfigWriter,
  blueprintRegistry: BlueprintRegistry,
  definitionLoader?: DefinitionLoader
) {
  async function handleGetCollection(
    _request: NextRequest,
    handle: string
  ): Promise<NextResponse> {
    const config = await configWriter.readCollectionConfig(handle)
    if (!config) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Collection "${handle}" not found` } },
        { status: 404 }
      )
    }
    return NextResponse.json({ data: config })
  }

  async function handleUpdateCollection(
    request: NextRequest,
    handle: string
  ): Promise<NextResponse> {
    const body = await request.json()

    const result = CollectionConfigSchema.safeParse(body)
    if (!result.success) {
      const details: Record<string, string[]> = {}
      for (const issue of result.error.issues) {
        const path = issue.path.join('.')
        if (!details[path]) {
          details[path] = []
        }
        details[path].push(issue.message)
      }
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request body failed schema validation',
            details,
          },
        },
        { status: 422 }
      )
    }

    try {
      await configWriter.writeCollectionConfig(handle, result.data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to write collection config'
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message } },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: result.data })
  }

  async function handleDeleteCollection(
    _request: NextRequest,
    handle: string
  ): Promise<NextResponse> {
    const collection = await contentEngine.getCollection(handle)
    if (!collection) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Collection "${handle}" not found` } },
        { status: 404 }
      )
    }

    // Try to delete the definition file first
    if (definitionLoader) {
      try {
        await definitionLoader.delete('collections', handle)
      } catch {
        // No definition file — might be a legacy blueprint-only collection
      }
    }

    // Also try to remove from madori.config.ts if present
    try {
      await configWriter.deleteCollectionConfig(handle)
    } catch {
      // Not in config — that's fine
    }

    // Invalidate cached collection list
    contentEngine.invalidateCollectionsCache()

    return NextResponse.json({ data: { deleted: true } })
  }

  return { handleGetCollection, handleUpdateCollection, handleDeleteCollection }
}
