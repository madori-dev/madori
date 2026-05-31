import { NextRequest, NextResponse } from 'next/server'
import { DefinitionLoader } from '@/lib/definitions/loader'
import { DefinitionSchemas } from '@/lib/definitions/schemas'
import {
  type EntityType,
  DefinitionNotFoundError,
  DefinitionValidationError,
  DefinitionParseError,
} from '@/lib/definitions/errors'

const VALID_ENTITY_TYPES: EntityType[] = ['collections', 'taxonomies', 'globals', 'navigations', 'forms']

function isValidEntityType(type: string): type is EntityType {
  return VALID_ENTITY_TYPES.includes(type as EntityType)
}

/**
 * Validate request body against the Zod schema for the given entity type.
 * Returns field-level errors suitable for a 422 response, or null if valid.
 */
function validateBody(
  entityType: EntityType,
  data: unknown
): { error: string; details: Record<string, string[]> } | null {
  const schema = DefinitionSchemas[entityType]
  const result = schema.safeParse(data)

  if (!result.success) {
    const details: Record<string, string[]> = {}
    for (const issue of result.error.issues) {
      const field = issue.path.length > 0 ? issue.path.join('.') : 'root'
      if (!details[field]) {
        details[field] = []
      }
      details[field].push(issue.message)
    }
    return { error: 'Validation failed', details }
  }

  return null
}

export function createDefinitionHandlers(loader: DefinitionLoader) {
  /**
   * GET /api/definitions/{type}
   * List all definitions for the given entity type.
   */
  async function handleListDefinitions(
    _request: NextRequest,
    entityType: string
  ): Promise<NextResponse> {
    if (!isValidEntityType(entityType)) {
      return NextResponse.json(
        { error: `Invalid entity type "${entityType}". Must be one of: ${VALID_ENTITY_TYPES.join(', ')}`, details: { entityType: [`Must be one of: ${VALID_ENTITY_TYPES.join(', ')}`] } },
        { status: 422 }
      )
    }

    try {
      const definitions = await loader.loadAll(entityType)
      const data = Array.from(definitions.entries()).map(([handle, def]) => ({
        handle,
        ...def,
      }))
      return NextResponse.json({ data }, { status: 200 })
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Internal server error' },
        { status: 500 }
      )
    }
  }

  /**
   * GET /api/definitions/{type}/{handle}
   * Get a single definition by type and handle.
   */
  async function handleGetDefinition(
    _request: NextRequest,
    entityType: string,
    handle: string
  ): Promise<NextResponse> {
    if (!isValidEntityType(entityType)) {
      return NextResponse.json(
        { error: `Invalid entity type "${entityType}". Must be one of: ${VALID_ENTITY_TYPES.join(', ')}`, details: { entityType: [`Must be one of: ${VALID_ENTITY_TYPES.join(', ')}`] } },
        { status: 422 }
      )
    }

    try {
      const definition = await loader.load(entityType, handle)
      return NextResponse.json({ data: { handle, ...definition as object } }, { status: 200 })
    } catch (error) {
      if (error instanceof DefinitionNotFoundError) {
        return NextResponse.json(
          { error: `Definition not found: ${entityType}/${handle}` },
          { status: 404 }
        )
      }
      if (error instanceof DefinitionParseError || error instanceof DefinitionValidationError) {
        return NextResponse.json(
          { error: error.message },
          { status: 422 }
        )
      }
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Internal server error' },
        { status: 500 }
      )
    }
  }

  /**
   * POST /api/definitions/{type}
   * Create a new definition. Body must include `handle` field.
   */
  async function handleCreateDefinition(
    request: NextRequest,
    entityType: string
  ): Promise<NextResponse> {
    if (!isValidEntityType(entityType)) {
      return NextResponse.json(
        { error: `Invalid entity type "${entityType}". Must be one of: ${VALID_ENTITY_TYPES.join(', ')}`, details: { entityType: [`Must be one of: ${VALID_ENTITY_TYPES.join(', ')}`] } },
        { status: 422 }
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body', details: { body: ['Must be valid JSON'] } },
        { status: 422 }
      )
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Request body must be an object', details: { body: ['Must be an object'] } },
        { status: 422 }
      )
    }

    const { handle, ...data } = body as Record<string, unknown>

    if (!handle || typeof handle !== 'string') {
      return NextResponse.json(
        { error: 'Validation failed', details: { handle: ['Handle is required and must be a string'] } },
        { status: 422 }
      )
    }

    // Validate the definition data (excluding handle) against schema
    const validationError = validateBody(entityType, data)
    if (validationError) {
      return NextResponse.json(validationError, { status: 422 })
    }

    try {
      await loader.create(entityType, handle, data)
      return NextResponse.json({ data: { handle, ...data } }, { status: 201 })
    } catch (error) {
      if (error instanceof DefinitionValidationError) {
        return NextResponse.json(
          { error: error.message, details: {} },
          { status: 422 }
        )
      }
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Internal server error' },
        { status: 500 }
      )
    }
  }

  /**
   * PUT /api/definitions/{type}/{handle}
   * Update an existing definition.
   */
  async function handleUpdateDefinition(
    request: NextRequest,
    entityType: string,
    handle: string
  ): Promise<NextResponse> {
    if (!isValidEntityType(entityType)) {
      return NextResponse.json(
        { error: `Invalid entity type "${entityType}". Must be one of: ${VALID_ENTITY_TYPES.join(', ')}`, details: { entityType: [`Must be one of: ${VALID_ENTITY_TYPES.join(', ')}`] } },
        { status: 422 }
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body', details: { body: ['Must be valid JSON'] } },
        { status: 422 }
      )
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Request body must be an object', details: { body: ['Must be an object'] } },
        { status: 422 }
      )
    }

    // Validate body against schema
    const validationError = validateBody(entityType, body)
    if (validationError) {
      return NextResponse.json(validationError, { status: 422 })
    }

    try {
      await loader.update(entityType, handle, body)
      return NextResponse.json({ data: { handle, ...body as object } }, { status: 200 })
    } catch (error) {
      if (error instanceof DefinitionNotFoundError) {
        return NextResponse.json(
          { error: `Definition not found: ${entityType}/${handle}` },
          { status: 404 }
        )
      }
      if (error instanceof DefinitionValidationError) {
        return NextResponse.json(
          { error: error.message, details: {} },
          { status: 422 }
        )
      }
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Internal server error' },
        { status: 500 }
      )
    }
  }

  /**
   * DELETE /api/definitions/{type}/{handle}
   * Delete a definition by type and handle.
   */
  async function handleDeleteDefinition(
    _request: NextRequest,
    entityType: string,
    handle: string
  ): Promise<NextResponse> {
    if (!isValidEntityType(entityType)) {
      return NextResponse.json(
        { error: `Invalid entity type "${entityType}". Must be one of: ${VALID_ENTITY_TYPES.join(', ')}`, details: { entityType: [`Must be one of: ${VALID_ENTITY_TYPES.join(', ')}`] } },
        { status: 422 }
      )
    }

    try {
      await loader.delete(entityType, handle)
      return new NextResponse(null, { status: 204 })
    } catch (error) {
      if (error instanceof DefinitionNotFoundError) {
        return NextResponse.json(
          { error: `Definition not found: ${entityType}/${handle}` },
          { status: 404 }
        )
      }
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Internal server error' },
        { status: 500 }
      )
    }
  }

  return {
    handleListDefinitions,
    handleGetDefinition,
    handleCreateDefinition,
    handleUpdateDefinition,
    handleDeleteDefinition,
  }
}
