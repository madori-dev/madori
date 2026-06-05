import { NextRequest, NextResponse } from 'next/server'
import { GlobalOperations } from '@/lib/content/globals'
import { getInvalidationEngine } from '@/lib/static-cache/instance'

export function createGlobalHandlers(globalOps: GlobalOperations) {
  async function handleListGlobals(): Promise<NextResponse> {
    const globals = await globalOps.listGlobals()
    return NextResponse.json({ data: globals })
  }

  async function handleGetGlobal(
    _request: NextRequest,
    handle: string
  ): Promise<NextResponse> {
    const global = await globalOps.getGlobal(handle)
    if (!global) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Global "${handle}" not found` } },
        { status: 404 }
      )
    }
    return NextResponse.json({ data: global })
  }

  async function handleUpdateGlobal(
    request: NextRequest,
    handle: string
  ): Promise<NextResponse> {
    const body = await request.json()
    const global = await globalOps.updateGlobal(handle, body)

    // Fire cache invalidation after successful global update
    const engine = getInvalidationEngine()
    if (engine) {
      engine.invalidate({ type: 'global', handle })
    }

    return NextResponse.json({ data: global })
  }

  return { handleListGlobals, handleGetGlobal, handleUpdateGlobal }
}
