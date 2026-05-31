import { NextRequest, NextResponse } from 'next/server'
import { NavigationOperations } from '@/lib/content/navigation'

export function createNavigationHandlers(navigationOps: NavigationOperations) {
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

  return { handleListNavigations, handleGetNavigation }
}
