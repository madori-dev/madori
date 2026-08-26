import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createSettingsRouteFamily } from '@/app/(cp)/api/routes/settings'
import { createDefinitionRouteFamily } from '@/app/(cp)/api/routes/definitions'
import { createGitRouteFamily } from '@/app/(cp)/api/routes/git'
import { createSeoRouteFamily } from '@/app/(cp)/api/routes/seo'
import type { RunAuthenticatedRoute, RoutePermission } from '@/app/(cp)/api/routes/contracts'
import type { RuntimeSettingsService } from '@/lib/settings/runtime'
import type { MadoriConfigService } from '@/lib/settings/config'
import type { DefinitionRepository } from '@/lib/blueprints/repository'
import type { createDefinitionHandlers } from '@/app/(cp)/api/handlers/definitions'
import type { MadoriInstance } from '@/lib/madori'

function runner(permissions: Array<RoutePermission | null>): RunAuthenticatedRoute {
  return async (request, _path, permission, handler) => {
    permissions.push(permission)
    return handler(request, {
      user: { id: 'user-1' } as never,
      hasPermission: vi.fn(async () => true),
    })
  }
}

describe('Control Panel route-family interfaces', () => {
  it('keeps unknown Settings paths outside its seam', async () => {
    const family = createSettingsRouteFamily({
      runtime: {} as RuntimeSettingsService,
      config: {} as MadoriConfigService,
      runAuthenticated: runner([]),
    })

    await expect(family(new NextRequest('https://example.test/api/settings/unknown'), ['settings', 'unknown'])).resolves.toBeNull()
  })

  it('owns Settings permission and read orchestration', async () => {
    const permissions: Array<RoutePermission | null> = []
    const read = vi.fn(async () => ({ siteName: 'Madori' }))
    const family = createSettingsRouteFamily({
      runtime: { read } as unknown as RuntimeSettingsService,
      config: {} as MadoriConfigService,
      runAuthenticated: runner(permissions),
    })

    const response = await family(new NextRequest('https://example.test/api/settings/runtime'), ['settings', 'runtime'])

    expect(permissions).toEqual([{ resource: 'settings', action: 'view' }])
    expect(read).toHaveBeenCalledOnce()
    await expect(response?.json()).resolves.toEqual({ data: { siteName: 'Madori' } })
  })

  it('owns Git method/path routing and permission handoff', async () => {
    const permissions: Array<RoutePermission | null> = []
    const status = vi.fn(async () => [{ repository: 'content', status: 'idle' }])
    const family = createGitRouteFamily(
      runner(permissions),
      async () => ({ gitRuntime: { status } }) as unknown as MadoriInstance,
    )

    const response = await family(new NextRequest('https://example.test/api/git/status'), ['git', 'status'])

    expect(permissions).toEqual([{ resource: 'git', action: 'view' }])
    expect(status).toHaveBeenCalledOnce()
    expect(response?.status).toBe(200)
    await expect(family(new NextRequest('https://example.test/api/git/status', { method: 'POST' }), ['git', 'status'])).resolves.toBeNull()
  })

  it('owns SEO method/path routing and scoped permission handoff', async () => {
    const permissions: Array<RoutePermission | null> = []
    const hasPermission = vi.fn(async () => true)
    const runAuthenticated: RunAuthenticatedRoute = async (request, _path, permission, handler) => {
      permissions.push(permission)
      return handler(request, { user: { id: 'user-1' } as never, hasPermission })
    }
    const listSites = vi.fn(async () => [])
    const madori = {
      config: { seo: { enabled: true, reports: true, redirects: true, errorTracking: true, allowedRedirectOrigins: [] } },
      seoRepository: { listSites },
      seoRedirects: {},
      seoNotFound: {},
      seoApplication: {},
    } as unknown as MadoriInstance
    const family = createSeoRouteFamily(runAuthenticated, async () => madori)

    const response = await family(new NextRequest('https://example.test/api/seo/sites?site=site-a'), ['seo', 'sites'])

    expect(permissions).toEqual([null])
    expect(hasPermission).toHaveBeenCalledWith('seo', 'view', 'site-a')
    expect(listSites).toHaveBeenCalledOnce()
    expect(response?.status).toBe(200)
    await expect(family(new NextRequest('https://example.test/api/seo/sites', { method: 'PATCH' }), ['seo', 'sites'])).resolves.toBeNull()
  })

  it('owns Fieldset matching, permission, and response shaping', async () => {
    const permissions: Array<RoutePermission | null> = []
    const list = vi.fn(async () => [{ handle: 'seo', fields: [{ handle: 'title' }], is_block: true, display: 'SEO' }])
    const family = createDefinitionRouteFamily({
      repository: { list } as unknown as DefinitionRepository,
      handlers: {} as ReturnType<typeof createDefinitionHandlers>,
      runAuthenticated: runner(permissions),
    })

    const response = await family(new NextRequest('https://example.test/api/fieldsets'), ['fieldsets'])

    expect(permissions).toEqual([{ resource: 'collections', action: 'view' }])
    await expect(response?.json()).resolves.toEqual({ data: [{ handle: 'seo', is_block: true, display: 'SEO' }] })
  })

  it('rejects unsafe Blueprint handles before authentication', async () => {
    const permissions: Array<RoutePermission | null> = []
    const family = createDefinitionRouteFamily({
      repository: {} as DefinitionRepository,
      handlers: {} as ReturnType<typeof createDefinitionHandlers>,
      runAuthenticated: runner(permissions),
    })

    const response = await family(new NextRequest('https://example.test/api/blueprints/collections/Unsafe'), ['blueprints', 'collections', 'Unsafe'])

    expect(response?.status).toBe(400)
    expect(permissions).toEqual([])
  })
})
