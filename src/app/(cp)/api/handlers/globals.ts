import { NextRequest, NextResponse } from 'next/server'
import { GlobalOperations } from '@/lib/content/globals'
import { NotFoundError } from '@/lib/errors'

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
    return NextResponse.json({ data: global })
  }

  return { handleListGlobals, handleGetGlobal, handleUpdateGlobal }
}
