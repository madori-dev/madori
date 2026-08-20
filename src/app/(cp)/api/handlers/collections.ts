import { NextRequest, NextResponse } from 'next/server'
import { CollectionConfigSchema } from '@/lib/config/schema'
import type { MadoriContentEngine } from '@/lib/content/engine'
import { DefinitionLoader } from '@/lib/definitions/loader'
import { DefinitionNotFoundError, DefinitionValidationError } from '@/lib/definitions/errors'
import type { CollectionDefinition } from '@/lib/definitions/schemas'

export function createCollectionHandlers(
  contentEngine: MadoriContentEngine,
  definitionLoader: DefinitionLoader,
) {
  async function handleGetCollection(
    _request: NextRequest,
    handle: string
  ): Promise<NextResponse> {
    try {
      const definition = await definitionLoader.load<CollectionDefinition>('collections', handle)
      return NextResponse.json({ data: { handle, ...definition } })
    } catch (error) {
      if (!(error instanceof DefinitionNotFoundError)) {
        return NextResponse.json(
          { error: { code: 'INVALID_DEFINITION', message: error instanceof Error ? error.message : 'Failed to load collection definition' } },
          { status: error instanceof DefinitionValidationError ? 422 : 500 }
        )
      }
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Collection "${handle}" not found` } },
        { status: 404 }
      )
    }
  }

  async function handleUpdateCollection(
    request: NextRequest,
    handle: string
  ): Promise<NextResponse> {
    const body = await request.json()

    const result = CollectionConfigSchema.safeParse({ ...body, handle })
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
      const { handle: _definitionHandle, redirects: _redirects, blueprints: _blueprints, ...definition } = result.data
      await definitionLoader.update('collections', handle, definition)
      contentEngine.invalidateCollectionsCache()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to write collection definition'
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

    try {
      await definitionLoader.delete('collections', handle)
    } catch {
      // Collection was found by the runtime but has no mutable definition.
    }

    // Invalidate cached collection list
    contentEngine.invalidateCollectionsCache()

    return NextResponse.json({
      data: {
        deleted: true,
        contentRetained: true,
        message: 'Collection definition removed. Existing entries and blueprint were retained to prevent data loss.',
      },
    })
  }

  return { handleGetCollection, handleUpdateCollection, handleDeleteCollection }
}
