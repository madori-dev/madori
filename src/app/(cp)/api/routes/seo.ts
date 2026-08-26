import { NextResponse, type NextRequest } from 'next/server'
import { getMadori } from '@/lib/madori'
import { createSeoHandlers, type SeoCapability } from '../handlers/seo'
import type { Action, ResourceType } from '@/lib/auth/permissions'
import type { RouteAuth, RouteFamily, RunAuthenticatedRoute } from './contracts'

type Madori = Awaited<ReturnType<typeof getMadori>>

function permissionFor(capability: SeoCapability): { resource: ResourceType; action: Action } {
  if (capability.startsWith('settings:') || capability === 'preview:read') {
    return { resource: 'seo', action: capability === 'settings:read' || capability === 'preview:read' ? 'view' : 'edit' }
  }
  if (capability === 'report:read') return { resource: 'seo-reports', action: 'view' }
  if (capability === 'report:run') return { resource: 'seo-reports', action: 'edit' }
  if (capability.startsWith('redirect:')) {
    return { resource: 'seo-redirects', action: capability === 'redirect:read' ? 'view' : capability === 'redirect:delete' ? 'delete' : 'edit' }
  }
  if (capability === 'not-found:promote') return { resource: 'seo-redirects', action: 'create' }
  return { resource: 'seo-errors', action: capability === 'not-found:read' ? 'view' : 'delete' }
}

export async function seoAuthorizationScope(
  request: Request,
  capability: SeoCapability,
  pathSegments: string[],
  madori: Madori,
): Promise<string | undefined> {
  const querySite = new URL(request.url).searchParams.get('site') ?? undefined
  if (pathSegments[1] === 'sites' && pathSegments[2]) return pathSegments[2]

  if (pathSegments[1] === 'redirects' && pathSegments[2]) {
    return (await madori.seoRedirects.get(pathSegments[2]))?.redirect.site
  }
  if (pathSegments[1] === 'not-found' && pathSegments[2] && pathSegments[2] !== 'promote') {
    return (await madori.seoNotFound.list()).observations.find(item => item.opaqueId === pathSegments[2])?.site
  }

  if (request.method !== 'GET' && (
    capability === 'preview:read'
    || capability === 'report:run'
    || capability.startsWith('redirect:')
    || capability === 'not-found:promote'
  )) {
    try {
      const input = await request.clone().json() as { site?: unknown; redirect?: { site?: unknown } }
      const site = input.redirect?.site ?? input.site
      return typeof site === 'string' ? site : undefined
    } catch {
      return undefined
    }
  }
  return request.method === 'GET' ? querySite : undefined
}

function available(madori: Madori, area: string | undefined): boolean {
  const seo = madori.config.seo
  return seo.enabled
    && (area !== 'report' && area !== 'reports' && area !== 'status' || seo.reports)
    && (area !== 'redirects' || seo.redirects)
    && (area !== 'not-found' || seo.errorTracking)
}

async function handlersFor(request: NextRequest, pathSegments: string[], auth: RouteAuth, madori: Madori) {
  return createSeoHandlers({
    repository: madori.seoRepository,
    redirects: madori.seoRedirects,
    redirectPolicy: { allowedExternalOrigins: madori.config.seo.allowedRedirectOrigins },
    notFound: madori.seoNotFound,
    preview: { resolve: (input) => madori.seoApplication.preview(input) },
    reports: {
      report: (input) => madori.seoApplication.report(input),
      status: (input) => madori.seoApplication.reportStatus(input),
      run: (input) => madori.seoApplication.runReport(input),
    },
    promoteNotFound: (input) => madori.seoApplication.promoteNotFound(input),
  }, {
    authorize: async (authorizationRequest, capability) => {
      const permission = permissionFor(capability)
      const scope = await seoAuthorizationScope(authorizationRequest, capability, pathSegments, madori)
      return auth.hasPermission(permission.resource, permission.action, scope)
    },
  })
}

export function createSeoRouteFamily(
  runAuthenticated: RunAuthenticatedRoute,
  loadMadori: () => Promise<Madori> = getMadori,
): RouteFamily {
  return async (request, pathSegments) => {
    if (pathSegments[0] !== 'seo') return null
    const routePath = pathSegments.join('/')
    const method = request.method
    const recognized =
      (routePath === 'seo/sites' && method === 'GET')
      || (pathSegments[1] === 'sites' && pathSegments.length === 3 && ['GET', 'PUT', 'POST', 'DELETE'].includes(method))
      || (pathSegments[1] === 'sections' && pathSegments.length === 3 && method === 'GET')
      || (pathSegments[1] === 'sections' && pathSegments.length === 4 && ['GET', 'PUT', 'POST', 'DELETE'].includes(method))
      || (routePath === 'seo/preview' && method === 'POST')
      || ((routePath === 'seo/report' || routePath === 'seo/reports') && method === 'GET')
      || ((routePath === 'seo/report/run' || routePath === 'seo/reports/run') && method === 'POST')
      || (routePath === 'seo/status' && method === 'GET')
      || (routePath === 'seo/redirects' && ['GET', 'POST', 'PUT'].includes(method))
      || (pathSegments[1] === 'redirects' && pathSegments.length === 3 && ['GET', 'DELETE'].includes(method))
      || (routePath === 'seo/not-found' && method === 'GET')
      || (routePath === 'seo/not-found/promote' && method === 'POST')
      || (pathSegments[1] === 'not-found' && pathSegments.length === 3 && method === 'DELETE')
    if (!recognized) return null

    return runAuthenticated(request, pathSegments, null, async (authenticatedRequest, auth) => {
      const madori = await loadMadori()
      if (!available(madori, pathSegments[1])) {
        return NextResponse.json(
          { error: { code: 'SEO_FEATURE_DISABLED', message: 'SEO feature is disabled' } },
          { status: 404 },
        )
      }
      const handlers = await handlersFor(authenticatedRequest, pathSegments, auth, madori)

      if (routePath === 'seo/sites' && method === 'GET') return handlers.handleListSites(authenticatedRequest)
      if (pathSegments[1] === 'sites' && pathSegments.length === 3) {
        const site = pathSegments[2]
        if (method === 'GET') return handlers.handleGetSite(authenticatedRequest, site)
        if (method === 'PUT' || method === 'POST') return handlers.handleSaveSite(authenticatedRequest, site)
        if (method === 'DELETE') return handlers.handleDeleteSite(authenticatedRequest, site)
      }
      if (pathSegments[1] === 'sections' && pathSegments.length === 3 && method === 'GET') {
        return handlers.handleListSections(authenticatedRequest, pathSegments[2])
      }
      if (pathSegments[1] === 'sections' && pathSegments.length === 4) {
        const [, , section, handle] = pathSegments
        if (method === 'GET') return handlers.handleGetSection(authenticatedRequest, section, handle)
        if (method === 'PUT' || method === 'POST') return handlers.handleSaveSection(authenticatedRequest, section, handle)
        if (method === 'DELETE') return handlers.handleDeleteSection(authenticatedRequest, section, handle)
      }
      if (routePath === 'seo/preview' && method === 'POST') return handlers.handleResolvedPreview(authenticatedRequest)
      if ((routePath === 'seo/report' || routePath === 'seo/reports') && method === 'GET') return handlers.handleGetReport(authenticatedRequest)
      if ((routePath === 'seo/report/run' || routePath === 'seo/reports/run') && method === 'POST') return handlers.handleRunReport(authenticatedRequest)
      if (routePath === 'seo/status' && method === 'GET') return handlers.handleGetStatus(authenticatedRequest)
      if (routePath === 'seo/redirects' && method === 'GET') return handlers.handleListRedirects(authenticatedRequest)
      if (routePath === 'seo/redirects' && (method === 'POST' || method === 'PUT')) return handlers.handleSaveRedirect(authenticatedRequest)
      if (pathSegments[1] === 'redirects' && pathSegments.length === 3) {
        if (method === 'GET') return handlers.handleGetRedirect(authenticatedRequest, pathSegments[2])
        if (method === 'DELETE') return handlers.handleDeleteRedirect(authenticatedRequest, pathSegments[2])
      }
      if (routePath === 'seo/not-found' && method === 'GET') return handlers.handleListNotFound(authenticatedRequest)
      if (routePath === 'seo/not-found/promote' && method === 'POST') return handlers.handlePromoteNotFound(authenticatedRequest)
      if (pathSegments[1] === 'not-found' && pathSegments.length === 3 && method === 'DELETE') {
        return handlers.handleDeleteNotFound(authenticatedRequest, pathSegments[2])
      }

      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, { status: 404 })
    })
  }
}
