import { NextRequest, NextResponse } from 'next/server'
import { ContentStore } from '@/lib/content/store'
import type { NavigationData } from '@/lib/content/store'

export type ContentEntityType = 'taxonomies' | 'forms' | 'globals' | 'navigations'

const VALID_ENTITY_TYPES: ContentEntityType[] = ['taxonomies', 'forms', 'globals', 'navigations']

function isValidEntityType(type: string): type is ContentEntityType {
  return VALID_ENTITY_TYPES.includes(type as ContentEntityType)
}

function jsonError(message: string, status: number, details?: Record<string, string[]>): NextResponse {
  return NextResponse.json(
    { error: message, ...(details ? { details } : {}) },
    { status }
  )
}

export function createContentHandlers(contentStore: ContentStore) {
  /**
   * GET /api/content/{type}/{handle}
   * List all content entries for a given entity type and handle.
   */
  async function handleListContent(
    _request: NextRequest,
    entityType: string,
    handle: string
  ): Promise<NextResponse> {
    if (!isValidEntityType(entityType)) {
      return jsonError(
        `Invalid entity type "${entityType}". Valid types: ${VALID_ENTITY_TYPES.join(', ')}`,
        422
      )
    }

    try {
      switch (entityType) {
        case 'taxonomies': {
          const entries = await contentStore.listTerms(handle)
          return NextResponse.json({ data: entries.map(e => ({ id: e.id, ...e.data })) })
        }
        case 'forms': {
          const entries = await contentStore.listSubmissions(handle)
          return NextResponse.json({ data: entries.map(e => ({ id: e.id, ...e.data })) })
        }
        case 'globals': {
          const data = await contentStore.getGlobal(handle)
          return NextResponse.json({ data })
        }
        case 'navigations': {
          const data = await contentStore.getNavigation(handle)
          return NextResponse.json({ data })
        }
      }
    } catch (error) {
      return jsonError(
        `Filesystem error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      )
    }
  }

  /**
   * GET /api/content/{type}/{handle}/{id}
   * Get a single content entry by ID.
   */
  async function handleGetContent(
    _request: NextRequest,
    entityType: string,
    handle: string,
    entryId: string
  ): Promise<NextResponse> {
    if (!isValidEntityType(entityType)) {
      return jsonError(
        `Invalid entity type "${entityType}". Valid types: ${VALID_ENTITY_TYPES.join(', ')}`,
        422
      )
    }

    try {
      switch (entityType) {
        case 'taxonomies': {
          const entry = await contentStore.getTerm(handle, entryId)
          if (!entry) {
            return jsonError(`Term "${entryId}" not found in taxonomy "${handle}"`, 404)
          }
          return NextResponse.json({ data: { id: entry.id, ...entry.data } })
        }
        case 'forms': {
          const entry = await contentStore.getSubmission(handle, entryId)
          if (!entry) {
            return jsonError(`Submission "${entryId}" not found in form "${handle}"`, 404)
          }
          return NextResponse.json({ data: { id: entry.id, ...entry.data } })
        }
        case 'globals': {
          // Globals are single-file, so GET single is same as GET list
          const data = await contentStore.getGlobal(handle)
          return NextResponse.json({ data })
        }
        case 'navigations': {
          // Navigations are single-file, so GET single is same as GET list
          const data = await contentStore.getNavigation(handle)
          return NextResponse.json({ data })
        }
      }
    } catch (error) {
      return jsonError(
        `Filesystem error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      )
    }
  }

  /**
   * POST /api/content/{type}/{handle}
   * Create a new content entry.
   */
  async function handleCreateContent(
    request: NextRequest,
    entityType: string,
    handle: string
  ): Promise<NextResponse> {
    if (!isValidEntityType(entityType)) {
      return jsonError(
        `Invalid entity type "${entityType}". Valid types: ${VALID_ENTITY_TYPES.join(', ')}`,
        422
      )
    }

    try {
      const body = await request.json()

      switch (entityType) {
        case 'taxonomies': {
          const { slug, ...data } = body
          if (!slug || typeof slug !== 'string') {
            return jsonError('Validation failed', 422, { slug: ['slug is required and must be a string'] })
          }
          // Check for duplicate slug within this taxonomy
          const existing = await contentStore.getTerm(handle, slug)
          if (existing) {
            return NextResponse.json(
              { error: { code: 'CONFLICT', message: 'A term with this slug already exists' } },
              { status: 422 }
            )
          }
          const entry = await contentStore.createTerm(handle, slug, data)
          return NextResponse.json({ data: { id: entry.id, ...entry.data } }, { status: 201 })
        }
        case 'forms': {
          const entry = await contentStore.createSubmission(handle, body)
          return NextResponse.json({ data: { id: entry.id, ...entry.data } }, { status: 201 })
        }
        case 'globals': {
          // Globals don't support create — use update instead
          return jsonError('Globals do not support create. Use PUT to update.', 422)
        }
        case 'navigations': {
          // Navigations don't support create — use update instead
          return jsonError('Navigations do not support create. Use PUT to update.', 422)
        }
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        return jsonError('Invalid JSON in request body', 422)
      }
      return jsonError(
        `Filesystem error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      )
    }
  }

  /**
   * PUT /api/content/{type}/{handle}/{id}
   * Update an existing content entry.
   */
  async function handleUpdateContent(
    request: NextRequest,
    entityType: string,
    handle: string,
    entryId: string
  ): Promise<NextResponse> {
    if (!isValidEntityType(entityType)) {
      return jsonError(
        `Invalid entity type "${entityType}". Valid types: ${VALID_ENTITY_TYPES.join(', ')}`,
        422
      )
    }

    try {
      const body = await request.json()

      switch (entityType) {
        case 'taxonomies': {
          const entry = await contentStore.updateTerm(handle, entryId, body)
          return NextResponse.json({ data: { id: entry.id, ...entry.data } })
        }
        case 'forms': {
          // Form submissions typically aren't updatable, but we can support it
          return jsonError('Form submissions do not support update', 422)
        }
        case 'globals': {
          const data = await contentStore.updateGlobal(handle, body)
          return NextResponse.json({ data })
        }
        case 'navigations': {
          const data = await contentStore.updateNavigation(handle, body as NavigationData)
          return NextResponse.json({ data })
        }
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        return jsonError('Invalid JSON in request body', 422)
      }
      return jsonError(
        `Filesystem error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      )
    }
  }

  /**
   * DELETE /api/content/{type}/{handle}/{id}
   * Delete a content entry.
   */
  async function handleDeleteContent(
    _request: NextRequest,
    entityType: string,
    handle: string,
    entryId: string
  ): Promise<NextResponse> {
    if (!isValidEntityType(entityType)) {
      return jsonError(
        `Invalid entity type "${entityType}". Valid types: ${VALID_ENTITY_TYPES.join(', ')}`,
        422
      )
    }

    try {
      switch (entityType) {
        case 'taxonomies': {
          await contentStore.deleteTerm(handle, entryId)
          return new NextResponse(null, { status: 204 })
        }
        case 'forms': {
          await contentStore.deleteSubmission(handle, entryId)
          return new NextResponse(null, { status: 204 })
        }
        case 'globals': {
          // Globals don't support delete — they are single-file entities
          return jsonError('Globals do not support delete', 422)
        }
        case 'navigations': {
          // Navigations don't support delete — they are single-file entities
          return jsonError('Navigations do not support delete', 422)
        }
      }
    } catch (error) {
      return jsonError(
        `Filesystem error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      )
    }
  }

  return {
    handleListContent,
    handleGetContent,
    handleCreateContent,
    handleUpdateContent,
    handleDeleteContent,
  }
}
