import { NextResponse } from 'next/server'
import type { MadoriConfigService } from '@/lib/settings/config'
import type { RuntimeSettingsService } from '@/lib/settings/runtime'
import type { RouteFamily, RunAuthenticatedRoute } from './contracts'

interface SettingsRoutes {
  runtime: RuntimeSettingsService
  config: MadoriConfigService
  runAuthenticated: RunAuthenticatedRoute
}

export function createSettingsRouteFamily(dependencies: SettingsRoutes): RouteFamily {
  return async (request, pathSegments) => {
    const routePath = pathSegments.join('/')
    const isRuntime = routePath === 'settings/runtime'
    const isConfig = routePath === 'settings/config'
    if (!isRuntime && !isConfig) return null

    if (request.method === 'GET') {
      return dependencies.runAuthenticated(request, pathSegments, { resource: 'settings', action: 'view' }, async () => {
        const value = isRuntime
          ? await dependencies.runtime.read()
          : await dependencies.config.readPublic()
        return NextResponse.json({ data: value })
      })
    }

    if (request.method === 'PUT') {
      return dependencies.runAuthenticated(request, pathSegments, { resource: 'settings', action: 'edit' }, async (req) => {
        const body = await req.json()
        if (isRuntime) {
          await dependencies.runtime.write(body)
          return NextResponse.json({ data: body, success: true })
        }

        const validation = await dependencies.config.validateForWrite(body)
        if (!validation.valid) {
          return NextResponse.json(
            { error: { code: 'VALIDATION_ERROR', message: 'Config validation failed', details: validation.errors } },
            { status: 422 },
          )
        }
        await dependencies.config.write(body)
        return NextResponse.json({ data: body, success: true, restartRequired: true })
      })
    }

    return null
  }
}
