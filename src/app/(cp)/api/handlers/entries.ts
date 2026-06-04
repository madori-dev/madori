import { NextRequest, NextResponse } from 'next/server'
import type { ContentEngine, EntryInput } from '@/lib/content/engine'
import { NotFoundError, ValidationError, ConflictError, MadoriError } from '@/lib/errors'
import { getInvalidationEngine } from '@/lib/static-cache/instance'

/**
 * Maps ContentEngine errors to appropriate HTTP JSON error responses.
 */
function mapEngineError(error: unknown): NextResponse {
  if (error instanceof ValidationError) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
          details: { fieldErrors: error.fieldErrors },
        },
      },
      { status: 422 }
    )
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: error.message } },
      { status: 404 }
    )
  }
  if (error instanceof ConflictError) {
    return NextResponse.json(
      {
        error: {
          code: 'CONFLICT',
          message: error.message,
          details: {
            submittedHash: error.submittedHash,
            currentHash: error.currentHash,
          },
        },
      },
      { status: 409 }
    )
  }
  if (error instanceof MadoriError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.statusCode }
    )
  }
  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
    { status: 500 }
  )
}

/**
 * Derive the front-end URL of an entry from its collection route pattern.
 * Falls back to /{collection}/{slug} if no route is defined.
 */
async function resolveEntryUrl(
  contentEngine: ContentEngine,
  collection: string,
  slug: string
): Promise<string> {
  const col = await contentEngine.getCollection(collection)
  if (col?.route) {
    return col.route.replace('{slug}', slug)
  }
  return `/${collection}/${slug}`
}

export function createEntryHandlers(contentEngine: ContentEngine) {
  /**
   * GET /entries/:collection — list entries in a collection
   */
  async function handleListEntries(
    _request: NextRequest,
    collection: string
  ): Promise<NextResponse> {
    try {
      const entries = await contentEngine.listEntries(collection)
      return NextResponse.json({ data: entries })
    } catch (error) {
      return mapEngineError(error)
    }
  }

  /**
   * GET /entries/:collection/:slug — get a single entry
   */
  async function handleGetEntry(
    _request: NextRequest,
    collection: string,
    slug: string
  ): Promise<NextResponse> {
    try {
      const entry = await contentEngine.getEntry(collection, slug)
      if (!entry) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: `Entry "${collection}/${slug}" not found` } },
          { status: 404 }
        )
      }
      return NextResponse.json({ data: entry })
    } catch (error) {
      return mapEngineError(error)
    }
  }

  /**
   * POST /entries/:collection — create a new entry
   */
  async function handleCreateEntry(
    request: NextRequest,
    collection: string
  ): Promise<NextResponse> {
    try {
      const body = await request.json()
      const { title, slug, status, author, content, data } = body as EntryInput

      if (!title || !slug) {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Title and slug are required',
              details: {
                fieldErrors: {
                  ...(title ? {} : { title: ['Title is required'] }),
                  ...(slug ? {} : { slug: ['Slug is required'] }),
                },
              },
            },
          },
          { status: 422 }
        )
      }

      const entry = await contentEngine.createEntry(collection, {
        title,
        slug,
        status,
        author,
        content,
        data,
      })

      // Fire cache invalidation after successful create
      const engine = getInvalidationEngine()
      if (engine) {
        const url = await resolveEntryUrl(contentEngine, collection, slug)
        engine.invalidate({ type: 'entry', collection, url })
      }

      return NextResponse.json({ data: entry }, { status: 201 })
    } catch (error) {
      return mapEngineError(error)
    }
  }

  /**
   * PUT /entries/:collection/:slug — update an existing entry
   */
  async function handleUpdateEntry(
    request: NextRequest,
    collection: string,
    slug: string
  ): Promise<NextResponse> {
    try {
      const body = await request.json()
      const { title, slug: newSlug, status, author, content, data, contentHash } = body as Partial<EntryInput> & { contentHash?: string }

      const entry = await contentEngine.updateEntry(collection, slug, {
        title,
        slug: newSlug,
        status,
        author,
        content,
        data,
      }, contentHash)

      // Fire cache invalidation after successful update
      const engine = getInvalidationEngine()
      if (engine) {
        const url = await resolveEntryUrl(contentEngine, collection, entry.slug)
        engine.invalidate({ type: 'entry', collection, url })
      }

      return NextResponse.json({ data: entry })
    } catch (error) {
      return mapEngineError(error)
    }
  }

  /**
   * DELETE /entries/:collection/:slug — delete an entry
   */
  async function handleDeleteEntry(
    _request: NextRequest,
    collection: string,
    slug: string
  ): Promise<NextResponse> {
    try {
      // Resolve URL before deletion (entry data won't be available after)
      const engine = getInvalidationEngine()
      let url: string | undefined
      if (engine) {
        url = await resolveEntryUrl(contentEngine, collection, slug)
      }

      await contentEngine.deleteEntry(collection, slug)

      // Fire cache invalidation after successful delete
      if (engine && url) {
        engine.invalidate({ type: 'entry', collection, url })
      }

      return NextResponse.json({ success: true })
    } catch (error) {
      return mapEngineError(error)
    }
  }

  return {
    handleListEntries,
    handleGetEntry,
    handleCreateEntry,
    handleUpdateEntry,
    handleDeleteEntry,
  }
}
