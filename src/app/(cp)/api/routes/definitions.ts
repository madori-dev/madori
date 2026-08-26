import { NextResponse } from 'next/server'
import type { Action, ResourceType } from '@/lib/auth/permissions'
import type { Blueprint, Fieldset } from '@/lib/blueprints/types'
import {
  DefinitionRepository,
  isValidBlueprintType,
  type DefinitionReference,
} from '@/lib/blueprints/repository'
import { requiredUnsupportedPublicFormFields } from '@/lib/forms/public-fields'
import type { createDefinitionHandlers } from '../handlers/definitions'
import type { RouteFamily, RunAuthenticatedRoute } from './contracts'

const resources: Record<string, ResourceType> = {
  collections: 'collections',
  taxonomies: 'taxonomies',
  globals: 'globals',
  forms: 'forms',
  navigations: 'navigation',
}

function error(code: string, message: string, status: number, details?: unknown): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status },
  )
}

function isSafeRouteHandle(handle: string): boolean {
  return /^[a-z0-9][a-z0-9_-]*$/.test(handle)
}

function removalResponse(reference: DefinitionReference, result: Awaited<ReturnType<DefinitionRepository['remove']>>): NextResponse {
  const label = reference.kind === 'fieldset'
    ? `Fieldset "${reference.handle}"`
    : `Blueprint "${reference.type}/${reference.handle}"`
  if (result.deleted) return NextResponse.json({ data: { deleted: true } })
  if (result.reason === 'not_found') return error('NOT_FOUND', `${label} not found`, 404)
  return error('CONFLICT', `${label} is used by ${result.references.length} ${reference.kind === 'fieldset' ? 'file(s)' : 'definition(s)'}`, 409, { references: result.references })
}

interface DefinitionRoutes {
  repository: DefinitionRepository
  handlers: ReturnType<typeof createDefinitionHandlers>
  runAuthenticated: RunAuthenticatedRoute
}

export function createDefinitionRouteFamily(dependencies: DefinitionRoutes): RouteFamily {
  return async (request, pathSegments) => {
    const [family, typeOrHandle, handle] = pathSegments
    const method = request.method

    if (family === 'definitions' && (pathSegments.length === 2 || pathSegments.length === 3)) {
      const resource = resources[typeOrHandle]
      if (!resource) return error('BAD_REQUEST', `Invalid definition type: ${typeOrHandle}`, 400)
      const action: Action | null = method === 'GET' ? 'view' : method === 'POST' ? 'create' : method === 'PUT' ? 'edit' : method === 'DELETE' ? 'delete' : null
      if (!action || (pathSegments.length === 2 && !['GET', 'POST'].includes(method)) || (pathSegments.length === 3 && !['GET', 'PUT', 'DELETE'].includes(method))) {
        return error('METHOD_NOT_ALLOWED', 'Method not allowed', 405)
      }
      return dependencies.runAuthenticated(request, pathSegments, { resource, action }, async (req) => {
        if (pathSegments.length === 2) {
          return method === 'GET'
            ? dependencies.handlers.handleListDefinitions(req, typeOrHandle)
            : dependencies.handlers.handleCreateDefinition(req, typeOrHandle)
        }
        if (method === 'GET') return dependencies.handlers.handleGetDefinition(req, typeOrHandle, handle)
        if (method === 'PUT') return dependencies.handlers.handleUpdateDefinition(req, typeOrHandle, handle)
        return dependencies.handlers.handleDeleteDefinition(req, typeOrHandle, handle)
      })
    }

    if (family === 'fieldsets' && (pathSegments.length === 1 || pathSegments.length === 2)) {
      if ((pathSegments.length === 1 && method !== 'GET') || (pathSegments.length === 2 && !['GET', 'PUT', 'DELETE'].includes(method))) return null
      if (pathSegments.length === 2 && !isSafeRouteHandle(typeOrHandle)) {
        return error('BAD_REQUEST', 'Handle must use lowercase letters, numbers, underscores, and hyphens', 400)
      }
      const action: Action | null = method === 'GET' ? 'view' : method === 'PUT' ? 'edit' : method === 'DELETE' ? 'delete' : null
      if (!action) return null
      return dependencies.runAuthenticated(request, pathSegments, { resource: 'collections', action }, async (req) => {
        if (pathSegments.length === 1) {
          const fieldsets = await dependencies.repository.list({ kind: 'fieldset' })
          return NextResponse.json({ data: fieldsets.map(({ handle: fieldsetHandle, is_block, display }) => ({ handle: fieldsetHandle, is_block, display })) })
        }
        const reference = { kind: 'fieldset' as const, handle: typeOrHandle }
        if (method === 'GET') {
          const fieldset = await dependencies.repository.read(reference)
          return fieldset ? NextResponse.json({ data: fieldset }) : error('NOT_FOUND', `Fieldset "${typeOrHandle}" not found`, 404)
        }
        if (method === 'DELETE') return removalResponse(reference, await dependencies.repository.remove(reference))
        const body = await req.json() as Partial<Fieldset>
        if (!Array.isArray(body.fields)) return error('BAD_REQUEST', 'Fieldset must include a "fields" array', 400)
        const validation = dependencies.repository.validateFieldset(body)
        if (!validation.success) return error('VALIDATION_ERROR', 'Invalid fieldset', 422, { errors: validation.errors })
        return NextResponse.json({ data: await dependencies.repository.write(reference, body as Fieldset) })
      })
    }

    if (family === 'blueprints' && ((pathSegments.length === 2 && method === 'GET') || pathSegments.length === 3)) {
      if (!isValidBlueprintType(typeOrHandle)) return error('BAD_REQUEST', `Invalid blueprint type: ${typeOrHandle}`, 400)
      if (pathSegments.length === 3 && !isSafeRouteHandle(handle)) {
        return error('BAD_REQUEST', 'Handle must use lowercase letters, numbers, underscores, and hyphens', 400)
      }
      const resource = resources[typeOrHandle]
      const action: Action | null = method === 'GET' ? 'view' : method === 'PUT' ? 'edit' : method === 'DELETE' ? 'delete' : null
      if (!resource) return null
      if (!action) return error('METHOD_NOT_ALLOWED', 'Method not allowed', 405)

      if (pathSegments.length === 2) {
        return dependencies.runAuthenticated(request, pathSegments, { resource, action }, async () =>
          NextResponse.json({ data: await dependencies.repository.list({ kind: 'blueprint', type: typeOrHandle }) }),
        )
      }

      const reference = { kind: 'blueprint' as const, type: typeOrHandle, handle }
      if (method === 'PUT') {
        return dependencies.runAuthenticated(request, pathSegments, null, async (req, auth) => {
          const existing = await dependencies.repository.read(reference)
          if (!await auth.hasPermission(resource, existing ? 'edit' : 'create')) {
            return error('AUTHORIZATION_ERROR', `Insufficient permissions to ${existing ? 'edit' : 'create'} ${resource}`, 403)
          }
          const blueprint = await req.json() as Blueprint
          const validation = dependencies.repository.validateBlueprint(blueprint)
          if (!validation.success) return error('VALIDATION_ERROR', 'Invalid blueprint', 422, { errors: validation.errors })
          if (typeOrHandle === 'forms') {
            const unsupported = requiredUnsupportedPublicFormFields(blueprint)
            if (unsupported.length) return error('UNSUPPORTED_PUBLIC_FORM_FIELDS', 'Form blueprints cannot require field types without a public renderer.', 422, { fields: unsupported })
          }
          return NextResponse.json({ data: await dependencies.repository.write(reference, blueprint) })
        })
      }

      return dependencies.runAuthenticated(request, pathSegments, { resource, action }, async () => {
        if (method === 'DELETE') return removalResponse(reference, await dependencies.repository.remove(reference))
        const blueprint = await dependencies.repository.read(reference)
        return blueprint ? NextResponse.json({ data: blueprint }) : error('NOT_FOUND', `Blueprint "${typeOrHandle}/${handle}" not found`, 404)
      })
    }

    return null
  }
}
