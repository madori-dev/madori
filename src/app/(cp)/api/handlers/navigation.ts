import { NextRequest, NextResponse } from 'next/server'
import { NavigationOperations } from '@/lib/content/navigation'
import { DefinitionLoader } from '@/lib/definitions/loader'
import { getTreeDepth, enforceMaxDepth } from '@/lib/navigation/tree'
import { getInvalidationEngine } from '@/lib/static-cache/instance'
import type { NavigationItem } from '@/lib/types'

interface NavigationDefinition {
  title: string
  blueprint?: string
  max_depth?: number
  collections?: string[]
}

export function createNavigationHandlers(navigationOps: NavigationOperations, definitionLoader?: DefinitionLoader) {
  async function handleListNavigations(): Promise<NextResponse> {
    const navigations = await navigationOps.listNavigations()
    return NextResponse.json({ data: navigations })
  }

  async function handleGetNavigation(
    _request: NextRequest,
    handle: string
  ): Promise<NextResponse> {
    const navigation = await navigationOps.getNavigation(handle)
    if (!navigation) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Navigation "${handle}" not found` } },
        { status: 404 }
      )
    }
    return NextResponse.json({ data: navigation })
  }

  async function handleSaveNavigation(
    request: NextRequest,
    handle: string
  ): Promise<NextResponse> {
    let body: { items?: NavigationItem[] }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
        { status: 400 }
      )
    }

    if (!body.items || !Array.isArray(body.items)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Body must include an "items" array' } },
        { status: 422 }
      )
    }

    const items = body.items as NavigationItem[]

    // Check max_depth from navigation definition if available
    if (definitionLoader) {
      try {
        const definition = await definitionLoader.load<NavigationDefinition>('navigations', handle)
        if (definition.max_depth !== undefined) {
          const actualDepth = getTreeDepth(items)
          if (!enforceMaxDepth(items, definition.max_depth)) {
            return NextResponse.json(
              {
                error: {
                  code: 'DEPTH_EXCEEDED',
                  message: `Navigation tree depth (${actualDepth}) exceeds the configured maximum depth (${definition.max_depth})`,
                  maxDepth: definition.max_depth,
                  actualDepth,
                },
              },
              { status: 422 }
            )
          }
        }
      } catch {
        // Definition not found — no max_depth constraint to enforce
      }
    }

    const navigation = await navigationOps.saveNavigation(handle, items)
    fireNavigationInvalidation(handle)
    return NextResponse.json({ data: navigation })
  }

  /**
   * Fires a navigation invalidation event.
   * Called after a successful navigation write operation.
   */
  function fireNavigationInvalidation(handle: string): void {
    const engine = getInvalidationEngine()
    if (engine) {
      engine.invalidate({ type: 'navigation', handle })
    }
  }

  return { handleListNavigations, handleGetNavigation, handleSaveNavigation, fireNavigationInvalidation }
}
