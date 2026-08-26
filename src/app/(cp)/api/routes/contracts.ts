import type { NextRequest, NextResponse } from 'next/server'
import type { Action, ResourceType } from '@/lib/auth/permissions'
import type { User } from '@/lib/auth/types'

export interface RouteAuth {
  user: User
  hasPermission(resource: ResourceType, action: Action, scope?: string): Promise<boolean>
}

export interface RoutePermission {
  resource: ResourceType
  action: Action
  scope?: string
}

export type AuthenticatedRouteHandler = (
  request: NextRequest,
  auth: RouteAuth,
) => Promise<NextResponse>

export type RunAuthenticatedRoute = (
  request: NextRequest,
  pathSegments: string[],
  permission: RoutePermission | null,
  handler: AuthenticatedRouteHandler,
) => Promise<NextResponse>

export type RouteFamily = (
  request: NextRequest,
  pathSegments: string[],
) => Promise<NextResponse | null>
