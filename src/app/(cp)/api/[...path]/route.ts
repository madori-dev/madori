import { NextRequest, NextResponse } from 'next/server'
import * as path from 'path'
import { loadConfig, resolveConfigPaths } from '@/lib/config/loader'
import { PermissionChecker } from '@/lib/auth/permissions'
import { PermissionGuard } from '@/lib/auth/guard'
import type { AuthContext } from '@/lib/auth/guard'
import { PluginRegistry } from '@/lib/auth/registry'
import { YamlUserProviderFactory } from '@/lib/auth/providers/yaml'
import { FileSessionStoreFactory } from '@/lib/auth/stores/file'
import { PasswordAuthDriverFactory } from '@/lib/auth/drivers/password'
import { compose } from '@/lib/auth/composer'
import type { ComposedAuthService, AuthConfig } from '@/lib/auth/composer'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { AtomicFileWriter } from '@/lib/fs/atomic-writer'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import { InMemoryContentCache } from '@/lib/cache/store'
import { BlueprintLoader } from '@/lib/blueprints/loader'
import { BlueprintRegistry } from '@/lib/blueprints/registry'
import type { Blueprint, BlueprintType } from '@/lib/blueprints/types'
import { MadoriContentEngine } from '@/lib/content/engine'
import { AssetOperations } from '@/lib/content/assets'
import { GlobalOperations } from '@/lib/content/globals'
import { NavigationOperations } from '@/lib/content/navigation'
import { TaxonomyOperations } from '@/lib/content/taxonomies'
import { FormOperations } from '@/lib/content/forms'
import { createAssetHandlers } from '../handlers/assets'
import { createUserHandlers, isValidUserId } from '../handlers/users'
import { createGlobalHandlers } from '../handlers/globals'
import { createTaxonomyHandlers } from '../handlers/taxonomies'
import { createNavigationHandlers } from '../handlers/navigation'
import { requiredUnsupportedPublicFormFields } from '@/lib/forms/public-fields'
import { createFormHandlers } from '../handlers/forms'
import { createEntryHandlers } from '../handlers/entries'
import { createCollectionHandlers } from '../handlers/collections'
import { createDefinitionHandlers } from '../handlers/definitions'
import { createContentHandlers } from '../handlers/content'
import { createDashboardHandlers } from '../handlers/dashboard'
import { createSeoHandlers, type SeoCapability } from '../handlers/seo'
import { DefinitionLoader } from '@/lib/definitions/loader'
import { ContentStore } from '@/lib/content/store'
import { initInvalidationEngine } from '@/lib/static-cache/instance'
import { RuntimeSettingsService } from '@/lib/settings/runtime'
import { MadoriConfigService } from '@/lib/settings/config'
import type { User, CreateUserInput, UpdateUserInput } from '@/lib/auth/types'
import type { ResourceType, Action } from '@/lib/auth/permissions'
import { AuthenticationError, AuthorizationError as AuthorizationErr } from '@/lib/errors'
import { getMadori } from '@/lib/madori'
import { GitError } from '@/lib/git'
import { createContentEngineSeoPort, promoteNotFoundObservation, SEO_REDIRECT_VERSION, SeoAuditRunner } from '@/lib/seo'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Internal AuthService interface — adapts ComposedAuthService to a shape
 * consumed by route handlers (password-based login, session validation
 * returning User, permission checking).
 */
interface AuthService {
  login(email: string, password: string): Promise<{ token: string; expiresAt: string }>
  logout(token: string): Promise<void>
  validateSession(token: string): Promise<User | null>
  createUser(input: CreateUserInput): Promise<User>
  updateUser(id: string, input: UpdateUserInput): Promise<User>
  deleteUser(id: string): Promise<void>
  listUsers(): Promise<User[]>
  hasPermission(user: User, resource: ResourceType, action: Action, scope?: string): Promise<boolean>
}

// --- Types ---

interface AuthenticatedContext {
  user: User
  authService: AuthService
}

type RouteHandler = (
  request: NextRequest,
  context: AuthenticatedContext,
  pathSegments: string[]
) => Promise<NextResponse>

type UnauthenticatedRouteHandler = (
  request: NextRequest,
  authService: AuthService,
  pathSegments: string[]
) => Promise<NextResponse>

const rolePermissionSchema = z.object({
  resource: z.enum(['collections', 'entries', 'taxonomies', 'assets', 'globals', 'forms', 'navigation', 'users', 'settings', 'git', 'seo', 'seo-reports', 'seo-redirects', 'seo-errors']),
  actions: z.array(z.enum(['view', 'create', 'edit', 'delete', 'publish'])).min(1).transform(actions => [...new Set(actions)]),
  scope: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/).optional(),
}).strict()
const rolePayloadSchema = z.object({
  handle: z.string().trim().regex(/^[a-z0-9][a-z0-9-]*$/),
  display: z.string().trim().min(1).max(120),
  permissions: z.array(rolePermissionSchema).max(200),
}).strict()

// --- Singleton service initialization ---

let authServiceInstance: AuthService | null = null
let composedAuthInstance: ComposedAuthService | null = null
let permissionGuardInstance: PermissionGuard | null = null
let servicesInitialized = false
let assetHandlers: ReturnType<typeof createAssetHandlers>
let userHandlers: ReturnType<typeof createUserHandlers>
let globalHandlers: ReturnType<typeof createGlobalHandlers>
let taxonomyHandlers: ReturnType<typeof createTaxonomyHandlers>
let navigationHandlers: ReturnType<typeof createNavigationHandlers>
let formHandlers: ReturnType<typeof createFormHandlers>
let entryHandlers: ReturnType<typeof createEntryHandlers>
let collectionHandlers: ReturnType<typeof createCollectionHandlers>
let definitionHandlers: ReturnType<typeof createDefinitionHandlers>
let contentHandlers: ReturnType<typeof createContentHandlers>
let runtimeSettingsService: RuntimeSettingsService
let madoriConfigService: MadoriConfigService
let contentEngineInstance: MadoriContentEngine
let resolvedResourcesPath: string
let blueprintRegistryInstance: BlueprintRegistry

/** @internal Exposed for testing — allows injecting a mock AuthService */
export function _setAuthServiceForTesting(service: AuthService | null): void {
  authServiceInstance = service
  servicesInitialized = false
}

/** @internal Exposed for testing — allows injecting a mock ComposedAuthService */
export function _setComposedAuthForTesting(service: ComposedAuthService | null): void {
  composedAuthInstance = service
}

/** @internal Exposed for testing — allows injecting mock entry handlers */
export function _setEntryHandlersForTesting(handlers: ReturnType<typeof createEntryHandlers> | null): void {
  if (handlers) {
    entryHandlers = handlers
  }
}

/** @internal Stub for testing — content engine injection will be implemented with entry routes */
export function _setContentEngineForTesting(_engine: unknown): void {
  // No-op: entry routes are not yet implemented in this handler
}

async function initializeServices(): Promise<AuthService> {
  if (authServiceInstance && servicesInitialized) return authServiceInstance

  // If auth service was injected for testing, use it without initializing content handlers
  if (authServiceInstance && !servicesInitialized) {
    servicesInitialized = true
    return authServiceInstance
  }

  const config = await loadConfig()
  const resolvedConfig = resolveConfigPaths(config, process.cwd())
  resolvedResourcesPath = resolvedConfig.resourcesPath

  const fs = new NodeFileSystemAdapter()
  const parser = new MarkdownYamlParser()
  const cache = new InMemoryContentCache()
  const { mutationBus } = await getMadori()

  // --- Auth Adapter System: compose auth service from config ---

  // 1. Create registry and register default adapters
  const registry = new PluginRegistry()
  registry.registerProvider('yaml', new YamlUserProviderFactory(fs, parser, mutationBus))
  registry.registerStore('file', new FileSessionStoreFactory(fs))

  // PasswordAuthDriver needs a UserProvider — resolve and instantiate it first
  const providerFactory = registry.resolveProvider(config.auth?.provider ?? 'yaml')
  const userProvider = providerFactory.create({
    usersPath: resolvedConfig.usersPath,
  })

  registry.registerDriver('password', new PasswordAuthDriverFactory(userProvider))

  // 2. Compose the auth service from config
  const authConfig: AuthConfig = {
    driver: config.auth?.driver ?? 'password',
    store: config.auth?.store ?? 'file',
    provider: config.auth?.provider ?? 'yaml',
    storeConfig: {
      sessionsDir: path.join(resolvedConfig.contentPath, '../.sessions'),
      ...config.auth?.storeConfig,
    },
    providerConfig: {
      usersPath: resolvedConfig.usersPath,
      ...config.auth?.providerConfig,
    },
    driverConfig: config.auth?.driverConfig,
  }

  const composedAuth = compose(registry, authConfig)
  composedAuthInstance = composedAuth

  // 3. Create PermissionChecker (remains independent of adapter system)
  const permissionChecker = new PermissionChecker(fs, parser, resolvedConfig.resourcesPath)

  // 3b. Create PermissionGuard — shared instance for CP route permission enforcement
  permissionGuardInstance = new PermissionGuard(permissionChecker, { permissions: new Map() })

  // 4. Adapt ComposedAuthService to existing AuthService interface for backward compatibility
  authServiceInstance = {
    async login(email: string, password: string) {
      return composedAuth.login(email, { password })
    },
    async logout(token: string) {
      return composedAuth.logout(token)
    },
    async validateSession(token: string): Promise<User | null> {
      const session = await composedAuth.validateSession(token)
      if (!session) return null
      try {
        const user = await composedAuth.getUser(session.userId)
        return user as User
      } catch {
        return null
      }
    },
    async createUser(input) {
      return composedAuth.createUser(input) as Promise<User>
    },
    async updateUser(id, input) {
      return composedAuth.updateUser(id, input) as Promise<User>
    },
    async deleteUser(id) {
      return composedAuth.deleteUser(id)
    },
    async listUsers() {
      return composedAuth.listUsers() as Promise<User[]>
    },
    async hasPermission(user: User, resource: ResourceType, action: Action, scope?: string) {
      return permissionChecker.hasPermission(user.roles, resource, action, scope)
    },
  }

  // --- Initialize content operation handlers ---
  const assetOps = new AssetOperations(resolvedConfig.assetsPath, fs, mutationBus)
  const globalOps = new GlobalOperations(fs, parser, cache, resolvedConfig.contentPath, mutationBus)
  const navigationOps = new NavigationOperations(fs, parser, cache, resolvedConfig.contentPath, mutationBus)
  const taxonomyOps = new TaxonomyOperations(config, fs, parser, cache)
  const formOps = new FormOperations(fs, parser, cache, resolvedConfig.contentPath, resolvedConfig.resourcesPath, mutationBus)

  // Initialize ContentEngine for entry operations
  const blueprintLoader = new BlueprintLoader(fs, parser, resolvedConfig.resourcesPath, mutationBus)
  blueprintRegistryInstance = new BlueprintRegistry(blueprintLoader)
  contentEngineInstance = new MadoriContentEngine(resolvedConfig, fs, parser, cache, blueprintRegistryInstance, mutationBus)

  assetHandlers = createAssetHandlers(assetOps)
  entryHandlers = createEntryHandlers(contentEngineInstance)
  userHandlers = createUserHandlers(
    composedAuth,
    async (role) => (await permissionChecker.loadRole(role)) !== null
  )
  globalHandlers = createGlobalHandlers(globalOps)
  taxonomyHandlers = createTaxonomyHandlers(taxonomyOps)

  // Initialize flat-file definition and content handlers
  const definitionLoader = new DefinitionLoader(resolvedConfig.resourcesPath, mutationBus)
  const flatContentStore = new ContentStore(resolvedConfig.contentPath, fs, mutationBus)

  navigationHandlers = createNavigationHandlers(navigationOps, definitionLoader, contentEngineInstance)
  formHandlers = createFormHandlers(formOps, blueprintRegistryInstance, {}, definitionLoader)

  definitionHandlers = createDefinitionHandlers(definitionLoader)
  contentHandlers = createContentHandlers(flatContentStore)

  collectionHandlers = createCollectionHandlers(contentEngineInstance, definitionLoader)

  // Dashboard handler for recent activity

  // Settings services
  const settingsPath = path.join(resolvedConfig.contentPath, 'settings.yaml')
  runtimeSettingsService = new RuntimeSettingsService(fs, parser, settingsPath, mutationBus)
  // Keep each path segment statically visible to Next's output tracer. A
  // dynamically assembled relative path causes Turbopack/NFT to trace cwd.
  const configFile = process.env.MADORI_E2E === '1'
    ? path.join(process.cwd(), 'tests', 'e2e', '.madori', 'madori.config.ts')
    : path.join(process.cwd(), 'madori.config.ts')
  madoriConfigService = new MadoriConfigService(configFile)

  // Initialize static cache invalidation engine
  initInvalidationEngine({
    enabled: config.staticCache?.enabled ?? false,
    driver: config.staticCache?.driver ?? 'application',
    storagePath: config.staticCache?.storagePath ?? 'storage/static-cache/',
    warmOnInvalidate: config.staticCache?.warmOnInvalidate ?? false,
    invalidationRules: config.staticCache?.invalidationRules ?? [],
  })

  servicesInitialized = true
  return authServiceInstance
}

// --- Error response helpers ---

function jsonError(code: string, message: string, statusCode: number, details?: unknown): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details !== undefined ? { details } : {}) } },
    { status: statusCode }
  )
}

function authenticationError(): NextResponse {
  return jsonError('AUTHENTICATION_ERROR', 'Invalid or expired session', 401)
}

function authorizationError(resource: string, action: string): NextResponse {
  return jsonError('AUTHORIZATION_ERROR', `Insufficient permissions to ${action} ${resource}`, 403)
}

function notFoundError(): NextResponse {
  return jsonError('NOT_FOUND', 'Route not found', 404)
}

function methodNotAllowedError(): NextResponse {
  return jsonError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)
}

const entityResources: Record<string, ResourceType> = {
  collections: 'collections',
  taxonomies: 'taxonomies',
  globals: 'globals',
  forms: 'forms',
  navigations: 'navigation',
}

function resourceForEntityType(type: string): ResourceType | null {
  return entityResources[type] ?? null
}

function isSafeHandle(handle: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(handle)
}

function invalidHandleError(): NextResponse {
  return jsonError('BAD_REQUEST', 'Handle must use lowercase letters, numbers, and hyphens', 400)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function findReferences(pattern: RegExp, directories: string[]): Promise<string[]> {
  const fs = new NodeFileSystemAdapter()
  const references: string[] = []

  for (const directory of directories) {
    if (!await fs.exists(directory)) continue
    const files = await fs.listFiles(directory, '**/*.yaml')
    for (const file of files) {
      const filePath = path.join(directory, file)
      if (pattern.test(await fs.readFile(filePath))) {
        references.push(filePath)
      }
    }
  }

  return references
}

// --- Auth middleware helpers ---

/**
 * Extract session token from Authorization header or madori_session cookie.
 */
function extractToken(request: NextRequest): string | null {
  // Check Authorization header first
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }

  // Fall back to cookie
  const cookie = request.cookies.get('madori_session')
  if (cookie?.value) {
    return cookie.value
  }

  return null
}

/**
 * Wraps a route handler with authentication.
 * Validates the session token and attaches the user to the context.
 */
function withAuth(handler: RouteHandler): UnauthenticatedRouteHandler {
  return async (request, authService, pathSegments) => {
    const token = extractToken(request)
    if (!token) {
      return authenticationError()
    }

    const user = await authService.validateSession(token)
    if (!user) {
      return authenticationError()
    }

    const madori = await getMadori()
    return madori.mutationBus.withContext({
      actor: { id: user.id, name: user.name, email: user.email },
      source: 'control-panel',
    }, () => handler(request, { user, authService }, pathSegments))
  }
}

/**
 * Wraps a route handler with permission checking using PermissionGuard.
 * Must be used after withAuth (expects an authenticated context).
 * Uses the same PermissionGuard.authorize() as the GraphQL resolvers.
 * Falls back to authService.hasPermission() when guard is not initialized (testing).
 */
function withPermission(resource: ResourceType, action: Action, scope?: string) {
  return (handler: RouteHandler): RouteHandler => {
    return async (request, context, pathSegments) => {
      if (permissionGuardInstance) {
        const authContext: AuthContext = {
          userId: context.user.id,
          roles: context.user.roles,
        }

        try {
          await permissionGuardInstance.authorize(authContext, resource, action, scope)
        } catch (error) {
          if (error instanceof AuthorizationErr) {
            return authorizationError(resource, action)
          }
          throw error
        }
      } else {
        // Fallback for test environments where guard may not be initialized
        const hasPermission = await context.authService.hasPermission(
          context.user,
          resource,
          action,
          scope
        )
        if (!hasPermission) {
          return authorizationError(resource, action)
        }
      }

      return handler(request, context, pathSegments)
    }
  }
}

// --- Route handlers ---

/**
 * POST /api/auth/login
 * Authenticates a user and returns a session token.
 * This route does NOT require auth middleware.
 */
async function handleLogin(request: NextRequest, authService: AuthService): Promise<NextResponse> {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return jsonError('VALIDATION_ERROR', 'Email and password are required', 422)
    }

    const session = await authService.login(email, password)

    const response = NextResponse.json({
      token: session.token,
      expiresAt: session.expiresAt,
    })

    // Also set the session cookie
    response.cookies.set('madori_session', session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: new Date(session.expiresAt),
    })

    return response
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return jsonError('AUTHENTICATION_ERROR', 'Invalid credentials', 401)
    }
    return jsonError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/**
 * POST /api/auth/logout
 * Destroys the current session. Requires auth middleware.
 */
const handleLogout: RouteHandler = async (request, context) => {
  const token = extractToken(request)
  if (token) {
    await context.authService.logout(token)
  }

  const response = NextResponse.json({ success: true })

  // Clear the session cookie
  response.cookies.set('madori_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
  })

  return response
}

function gitErrorResponse(error: unknown): NextResponse {
  if (error instanceof GitError) {
    const status = error.code === 'DISABLED' ? 409 : error.code === 'UNKNOWN_REPOSITORY' ? 404 : 422
    return jsonError(error.code, error.message, status)
  }
  return jsonError('GIT_SYNC_FAILED', 'Git synchronization failed', 500)
}

async function gitRepositoryId(request: NextRequest): Promise<string | undefined> {
  try {
    const body = await request.json() as { repository?: unknown }
    if (body.repository === undefined) return undefined
    if (typeof body.repository !== 'string' || !/^[a-f0-9]{64}$/.test(body.repository)) throw new Error('invalid')
    return body.repository
  } catch {
    throw new GitError('Repository identifier is invalid', 'INVALID_INPUT')
  }
}

async function createRequestSeoHandlers(context: AuthenticatedContext, pathSegments: string[]) {
  const madori = await getMadori()
  const permissionFor = (capability: SeoCapability): { resource: ResourceType; action: Action } => {
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

  return createSeoHandlers({
    repository: madori.seoRepository,
    redirects: madori.seoRedirects,
    redirectPolicy: { allowedExternalOrigins: madori.config.seo.allowedRedirectOrigins },
    notFound: madori.seoNotFound,
    preview: {
      async resolve(input) {
        const authenticated = { isAuthenticated: () => true }
        if ('type' in input) {
          return input.type === 'entry'
            ? madori.seoRuntime.previewEntry({ site: input.site, collection: input.collection, slug: input.slug }, authenticated)
            : madori.seoRuntime.previewTerm({ site: input.site, taxonomy: input.taxonomy, slug: input.slug }, authenticated)
        }
        const site = 'site' in input ? input.site : madori.sites.find(candidate => candidate.isDefault)?.handle ?? madori.sites[0].handle
        if (!site) throw new Error('No SEO site is configured')
        return madori.seoRuntime.previewDefaults({
          site,
          ...('section' in input ? { section: input.section, handle: input.handle } : {}),
        }, authenticated)
      },
    },
    reports: {
      async report({ site, page, perPage }) {
        const latest = (await madori.seoAuditSnapshots.list())[0]
        if (!latest) return { report: null, issues: [], page, perPage, total: 0 }
        const issues = latest.report.issues.filter(issue => !site || issue.subject.site === site)
        const filtered = summarizeSeoIssues(issues)
        const visible = issues.slice((page - 1) * perPage, page * perPage).map(issue => ({
          id: `${issue.subject.id}:${issue.ruleId}`,
          severity: issue.severity === 'info' ? 'notice' : issue.severity,
          title: issue.message,
          description: issue.recommendation,
          type: issue.ruleId,
        }))
        return { report: { ...latest.report, ...filtered, issues: undefined }, issues: visible, page, perPage, total: issues.length }
      },
      async status({ site }) {
        const latest = (await madori.seoAuditSnapshots.list())[0]
        if (!latest) return { available: false, site: site ?? null }
        const issues = latest.report.issues.filter(issue => !site || issue.subject.site === site)
        return { available: true, id: latest.id, createdAt: latest.createdAt, ...summarizeSeoIssues(issues), issueCount: issues.length }
      },
      async run({ site }) {
        if (madori.config.seo.reports === false) throw new Error('SEO reports are disabled')
        const result = await new SeoAuditRunner({
          content: createContentEngineSeoPort(madori.contentEngine),
          runtime: madori.seoRuntime,
          redirects: madori.seoRedirects,
          engine: madori.seoAudit,
          snapshots: madori.seoAuditSnapshots,
          sites: madori.sites,
        }).run({ site })
        return { id: result.report.id, createdAt: result.report.createdAt, score: result.report.score, summary: result.report.summary, pages: result.pages, redirects: result.redirects }
      },
    },
    async promoteNotFound(input) {
      const suggestion = promoteNotFoundObservation(input.site, input.source, input.destination)
      const observation = input.opaqueId
        ? (await madori.seoNotFound.list()).observations.find(item => item.opaqueId === input.opaqueId)
        : undefined
      const cleanupId = _matchingNotFoundObservationForTesting(observation, input.site, suggestion.source)
      const saved = await madori.seoRedirects.save({
        version: SEO_REDIRECT_VERSION,
        id: `redirect_${randomUUID().replaceAll('-', '')}`,
        ...suggestion,
        status: input.status ?? suggestion.status,
      })
      let observationDeleted = false
      if (cleanupId) {
        try { observationDeleted = await madori.seoNotFound.delete(cleanupId) } catch { /* Redirect remains valid if operational cleanup fails. */ }
      }
      return { ...saved.redirect, revision: saved.revision, observationDeleted }
    },
  }, {
    authorize: async (request, capability) => {
      const permission = permissionFor(capability)
      const scope = await seoAuthorizationScope(request, capability, pathSegments, madori)
      return context.authService.hasPermission(context.user, permission.resource, permission.action, scope)
    },
  })
}

export function _summarizeSeoIssuesForTesting(issues: readonly { severity: 'info' | 'warning' | 'error' | 'critical' }[]) {
  const summary = { total: issues.length, info: 0, warning: 0, error: 0, critical: 0 }
  const penalties = { info: 1, warning: 4, error: 10, critical: 20 }
  let penalty = 0
  for (const issue of issues) {
    summary[issue.severity]++
    penalty += penalties[issue.severity]
  }
  return { score: Math.max(0, 100 - penalty), summary }
}

const summarizeSeoIssues = _summarizeSeoIssuesForTesting

export function _matchingNotFoundObservationForTesting(
  observation: { opaqueId: string; site: string; path: string } | undefined,
  site: string,
  source: string,
): string | undefined {
  return observation?.site === site && observation.path === source ? observation.opaqueId : undefined
}

async function seoAuthorizationScope(
  request: Request,
  capability: SeoCapability,
  pathSegments: string[],
  madori: Awaited<ReturnType<typeof getMadori>>,
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

/** @internal Authorization regression seam; production callers use withSeoRequest. */
export const _seoAuthorizationScopeForTesting = seoAuthorizationScope

async function withSeoRequest(
  request: NextRequest,
  authService: AuthService,
  pathSegments: string[],
  call: (handlers: Awaited<ReturnType<typeof createRequestSeoHandlers>>, request: NextRequest) => Promise<NextResponse>,
): Promise<NextResponse> {
  return withAuth(async (authenticatedRequest, context) => {
    const seo = (await getMadori()).config.seo
    const area = pathSegments[1]
    const available = seo.enabled
      && (area !== 'report' && area !== 'reports' && area !== 'status' || seo.reports)
      && (area !== 'redirects' || seo.redirects)
      && (area !== 'not-found' || seo.errorTracking)
    if (!available) return jsonError('SEO_FEATURE_DISABLED', 'SEO feature is disabled', 404)
    return call(await createRequestSeoHandlers(context, pathSegments), authenticatedRequest)
  })(request, authService, pathSegments)
}

// --- Route dispatching ---

/**
 * Match a path to a handler based on method and path segments.
 */
async function dispatch(
  request: NextRequest,
  pathSegments: string[]
): Promise<NextResponse> {
  const authService = await initializeServices()
  const method = request.method
  const routePath = pathSegments.join('/')

  // POST /auth/login — no auth required
  if (routePath === 'auth/login' && method === 'POST') {
    return handleLogin(request, authService)
  }

  // GET /auth/validate — lightweight session check for middleware (no auth required)
  if (routePath === 'auth/validate' && method === 'GET') {
    const token = extractToken(request)
    if (!token) return jsonError('AUTHENTICATION_ERROR', 'No token', 401)
    const session = composedAuthInstance
      ? await composedAuthInstance.validateSession(token)
      : null
    if (!session) return jsonError('AUTHENTICATION_ERROR', 'Invalid session', 401)
    return NextResponse.json({ valid: true, userId: session.userId })
  }

  // POST /auth/logout — auth required
  if (routePath === 'auth/logout' && method === 'POST') {
    const handler = withAuth(handleLogout)
    return handler(request, authService, pathSegments)
  }

  // --- Git ---
  if (routePath === 'git/status' && method === 'GET') {
    const handler = withAuth(withPermission('git', 'view')(
      async () => NextResponse.json({ data: { repositories: await (await getMadori()).gitRuntime.status() } })
    ))
    return handler(request, authService, pathSegments)
  }
  if (routePath === 'git/sync' && method === 'POST') {
    const handler = withAuth(withPermission('git', 'edit')(
      async (req) => {
        try {
          const repository = await gitRepositoryId(req)
          return NextResponse.json({ data: { results: await (await getMadori()).gitRuntime.sync(repository) } })
        } catch (error) { return gitErrorResponse(error) }
      }
    ))
    return handler(request, authService, pathSegments)
  }
  if (routePath === 'git/retry' && method === 'POST') {
    const handler = withAuth(withPermission('git', 'edit')(
      async (req) => {
        try {
          const repository = await gitRepositoryId(req)
          if (!repository) throw new GitError('Repository identifier is required', 'INVALID_INPUT')
          return NextResponse.json({ data: { result: await (await getMadori()).gitRuntime.retry(repository) } })
        } catch (error) { return gitErrorResponse(error) }
      }
    ))
    return handler(request, authService, pathSegments)
  }

  // --- SEO ---
  if (routePath === 'seo/sites' && method === 'GET') {
    return withSeoRequest(request, authService, pathSegments, (handlers, req) => handlers.handleListSites(req))
  }
  if (pathSegments[0] === 'seo' && pathSegments[1] === 'sites' && pathSegments.length === 3) {
    const site = pathSegments[2]
    if (method === 'GET') return withSeoRequest(request, authService, pathSegments, (handlers, req) => handlers.handleGetSite(req, site))
    if (method === 'PUT' || method === 'POST') return withSeoRequest(request, authService, pathSegments, (handlers, req) => handlers.handleSaveSite(req, site))
    if (method === 'DELETE') return withSeoRequest(request, authService, pathSegments, (handlers, req) => handlers.handleDeleteSite(req, site))
  }
  if (pathSegments[0] === 'seo' && pathSegments[1] === 'sections' && pathSegments.length === 3 && method === 'GET') {
    return withSeoRequest(request, authService, pathSegments, (handlers, req) => handlers.handleListSections(req, pathSegments[2]))
  }
  if (pathSegments[0] === 'seo' && pathSegments[1] === 'sections' && pathSegments.length === 4) {
    const [, , section, handle] = pathSegments
    if (method === 'GET') return withSeoRequest(request, authService, pathSegments, (handlers, req) => handlers.handleGetSection(req, section, handle))
    if (method === 'PUT' || method === 'POST') return withSeoRequest(request, authService, pathSegments, (handlers, req) => handlers.handleSaveSection(req, section, handle))
    if (method === 'DELETE') return withSeoRequest(request, authService, pathSegments, (handlers, req) => handlers.handleDeleteSection(req, section, handle))
  }
  if (routePath === 'seo/preview' && method === 'POST') {
    return withSeoRequest(request, authService, pathSegments, (handlers, req) => handlers.handleResolvedPreview(req))
  }
  if ((routePath === 'seo/report' || routePath === 'seo/reports') && method === 'GET') {
    return withSeoRequest(request, authService, pathSegments, (handlers, req) => handlers.handleGetReport(req))
  }
  if ((routePath === 'seo/report/run' || routePath === 'seo/reports/run') && method === 'POST') {
    return withSeoRequest(request, authService, pathSegments, (handlers, req) => handlers.handleRunReport(req))
  }
  if (routePath === 'seo/status' && method === 'GET') {
    return withSeoRequest(request, authService, pathSegments, (handlers, req) => handlers.handleGetStatus(req))
  }
  if (routePath === 'seo/redirects' && method === 'GET') {
    return withSeoRequest(request, authService, pathSegments, (handlers, req) => handlers.handleListRedirects(req))
  }
  if (routePath === 'seo/redirects' && (method === 'POST' || method === 'PUT')) {
    return withSeoRequest(request, authService, pathSegments, (handlers, req) => handlers.handleSaveRedirect(req))
  }
  if (pathSegments[0] === 'seo' && pathSegments[1] === 'redirects' && pathSegments.length === 3) {
    const id = pathSegments[2]
    if (method === 'GET') return withSeoRequest(request, authService, pathSegments, (handlers, req) => handlers.handleGetRedirect(req, id))
    if (method === 'DELETE') return withSeoRequest(request, authService, pathSegments, (handlers, req) => handlers.handleDeleteRedirect(req, id))
  }
  if (routePath === 'seo/not-found' && method === 'GET') {
    return withSeoRequest(request, authService, pathSegments, (handlers, req) => handlers.handleListNotFound(req))
  }
  if (routePath === 'seo/not-found/promote' && method === 'POST') {
    return withSeoRequest(request, authService, pathSegments, (handlers, req) => handlers.handlePromoteNotFound(req))
  }
  if (pathSegments[0] === 'seo' && pathSegments[1] === 'not-found' && pathSegments.length === 3 && method === 'DELETE') {
    return withSeoRequest(request, authService, pathSegments, (handlers, req) => handlers.handleDeleteNotFound(req, pathSegments[2]))
  }

  // --- Assets ---
  if (routePath === 'assets/upload' && method === 'POST') {
    const handler = withAuth(withPermission('assets', 'create')(
      async (req) => assetHandlers.handleUploadAsset(req)
    ))
    return handler(request, authService, pathSegments)
  }

  if (routePath === 'assets/upload-multiple' && method === 'POST') {
    const handler = withAuth(withPermission('assets', 'create')(
      async (req) => assetHandlers.handleUploadMultiple(req)
    ))
    return handler(request, authService, pathSegments)
  }

  if (routePath === 'assets/move' && method === 'POST') {
    const handler = withAuth(withPermission('assets', 'edit')(
      async (req) => assetHandlers.handleMoveAsset(req)
    ))
    return handler(request, authService, pathSegments)
  }

  if (routePath === 'assets/bulk-move' && method === 'POST') {
    const handler = withAuth(withPermission('assets', 'edit')(
      async (req) => assetHandlers.handleBulkMove(req)
    ))
    return handler(request, authService, pathSegments)
  }

  if (routePath === 'assets/bulk-delete' && method === 'POST') {
    const handler = withAuth(withPermission('assets', 'delete')(
      async (req) => assetHandlers.handleBulkDelete(req)
    ))
    return handler(request, authService, pathSegments)
  }

  if (routePath === 'assets/directories' && method === 'POST') {
    const handler = withAuth(withPermission('assets', 'create')(
      async (req) => assetHandlers.handleCreateDirectory(req)
    ))
    return handler(request, authService, pathSegments)
  }

  if (routePath === 'assets/directories/delete' && method === 'POST') {
    const handler = withAuth(withPermission('assets', 'delete')(
      async (req) => assetHandlers.handleDeleteDirectory(req)
    ))
    return handler(request, authService, pathSegments)
  }

  if (routePath === 'assets/directories/rename' && method === 'POST') {
    const handler = withAuth(withPermission('assets', 'edit')(
      async (req) => assetHandlers.handleRenameDirectory(req)
    ))
    return handler(request, authService, pathSegments)
  }

  if (routePath === 'assets' && method === 'GET') {
    const handler = withAuth(withPermission('assets', 'view')(
      async (req) => assetHandlers.handleListAssets(req)
    ))
    return handler(request, authService, pathSegments)
  }

  if (pathSegments[0] === 'assets' && pathSegments.length > 1 && method === 'DELETE') {
    const assetPathSegments = pathSegments.slice(1)
    const handler = withAuth(withPermission('assets', 'delete')(
      async (req) => assetHandlers.handleDeleteAsset(req, assetPathSegments)
    ))
    return handler(request, authService, pathSegments)
  }

  if (pathSegments[0] === 'assets' && pathSegments.length > 1 && method === 'PATCH') {
    const assetPathSegments = pathSegments.slice(1)
    const handler = withAuth(withPermission('assets', 'edit')(
      async (req) => assetHandlers.handleUpdateMetadata(req, assetPathSegments)
    ))
    return handler(request, authService, pathSegments)
  }

  // --- Users ---

  if (routePath === 'users/capabilities' && method === 'GET') {
    const handler = withAuth(async (_req, context) => {
      const resources: ResourceType[] = ['collections', 'entries', 'taxonomies', 'assets', 'globals', 'forms', 'navigation', 'users', 'settings', 'git', 'seo', 'seo-reports', 'seo-redirects', 'seo-errors']
      const actions: Action[] = ['view', 'create', 'edit', 'delete', 'publish']
      const checks: Array<[ResourceType, Action]> = resources.flatMap(resource => actions.map(action => [resource, action] as [ResourceType, Action]))
      const values = await Promise.all(checks.map(async ([resource, action]) => [`${resource}:${action}`, await context.authService.hasPermission(context.user, resource, action)] as const))
      const scopedEntries = await contentEngineInstance.listCollections().then(async collections => Object.fromEntries(await Promise.all(collections.map(async collection => [collection.handle, Object.fromEntries(await Promise.all(actions.map(async action => [action, await context.authService.hasPermission(context.user, 'entries', action, collection.handle)] as const)))])))).catch(() => ({}))
      return NextResponse.json({ data: { capabilities: Object.fromEntries(values), scopes: { entries: scopedEntries } } })
    })
    return handler(request, authService, pathSegments)
  }

  // File-defined roles are intentionally read through this narrow contract so
  // user editors never need hard-coded role names.
  if (routePath === 'roles' && method === 'GET') {
    const handler = withAuth(withPermission('users', 'view')(
      async () => {
        const roleDirectory = path.join(resolvedResourcesPath, 'roles')
        const roleFs = new NodeFileSystemAdapter()
        const roleParser = new MarkdownYamlParser()
        const files = await roleFs.listFiles(roleDirectory, '*.yaml').catch(() => [] as string[])
        const roles = await Promise.all(files.map(async (file) => {
          const value = roleParser.parseYaml<{ handle?: string; display?: string; permissions?: unknown[] }>(await roleFs.readFile(path.join(roleDirectory, file)))
          return value.handle && /^[a-z0-9][a-z0-9-]*$/.test(value.handle)
            ? { handle: value.handle, display: value.display ?? value.handle, permissions: value.permissions ?? [] }
            : null
        }))
        return NextResponse.json({ data: roles.filter((role): role is NonNullable<typeof role> => role !== null) })
      }
    ))
    return handler(request, authService, pathSegments)
  }

  if (routePath === 'roles' && method === 'POST') {
    const handler = withAuth(withPermission('users', 'edit')(async (req) => {
      const parsed = rolePayloadSchema.safeParse(await req.json())
      if (!parsed.success) return jsonError('VALIDATION_ERROR', 'Role payload is invalid', 422)
      const role = parsed.data
      const file = path.join(resolvedResourcesPath, 'roles', `${role.handle}.yaml`)
      const roleFs = new NodeFileSystemAdapter()
      if (await roleFs.exists(file)) return jsonError('CONFLICT', 'Role already exists', 409)
      const writer = new AtomicFileWriter(roleFs)
      const result = await writer.writeFileAtomic(file, new MarkdownYamlParser().serializeYaml(role))
      if (!result.success) throw result.error
      ;(await getMadori()).mutationBus.report({ action: 'create', paths: [file], resource: { type: 'role', id: role.handle }, message: `Created role ${role.handle}`, source: 'system', timestamp: Date.now() })
      return NextResponse.json({ data: { handle: role.handle, display: role.display, permissions: role.permissions } }, { status: 201 })
    }))
    return handler(request, authService, pathSegments)
  }

  if (pathSegments[0] === 'roles' && pathSegments.length === 2 && (method === 'PUT' || method === 'DELETE')) {
    const handle = pathSegments[1]
    if (!/^[a-z0-9][a-z0-9-]*$/.test(handle)) return jsonError('VALIDATION_ERROR', 'Invalid role handle', 422)
    const handler = withAuth(withPermission('users', method === 'DELETE' ? 'delete' : 'edit')(async (req, context) => {
      const file = path.join(resolvedResourcesPath, 'roles', `${handle}.yaml`)
      const roleFs = new NodeFileSystemAdapter()
      if (!await roleFs.exists(file)) return jsonError('NOT_FOUND', 'Role not found', 404)
      if (handle === 'admin') return jsonError('ROLE_PROTECTED', 'Built-in admin role cannot be changed or deleted', 403)
      if (method === 'DELETE') {
        const assigned = (await context.authService.listUsers()).some(user => user.roles.includes(handle))
        if (assigned) return jsonError('ROLE_ASSIGNED', 'Reassign users before deleting this role', 409)
        await roleFs.deleteFile(file); ;(await getMadori()).mutationBus.report({ action: 'delete', paths: [file], resource: { type: 'role', id: handle }, message: `Deleted role ${handle}`, source: 'system', timestamp: Date.now() }); return NextResponse.json({ success: true })
      }
      const parsed = rolePayloadSchema.omit({ handle: true }).safeParse(await req.json())
      if (!parsed.success) return jsonError('VALIDATION_ERROR', 'Role payload is invalid', 422)
      const role = parsed.data
      const result = await new AtomicFileWriter(roleFs).writeFileAtomic(file, new MarkdownYamlParser().serializeYaml({ handle, ...role }))
      if (!result.success) throw result.error
      ;(await getMadori()).mutationBus.report({ action: 'update', paths: [file], resource: { type: 'role', id: handle }, message: `Updated role ${handle}`, source: 'system', timestamp: Date.now() })
      return NextResponse.json({ data: { handle, display: role.display, permissions: role.permissions } })
    }))
    return handler(request, authService, pathSegments)
  }

  // GET /api/users/me — return current authenticated user profile
  if (routePath === 'users/me' && method === 'GET') {
    const handler = withAuth(
      async (_req, context) => {
        const { id, email, name, roles, createdAt, lastLogin, theme } = context.user
        return NextResponse.json({
          data: { id, email, name, roles, createdAt, lastLogin, theme: theme ?? 'light' },
        })
      }
    )
    return handler(request, authService, pathSegments)
  }

  if (routePath === 'users' && method === 'GET') {
    const handler = withAuth(withPermission('users', 'view')(
      async () => userHandlers.handleListUsers()
    ))
    return handler(request, authService, pathSegments)
  }

  if (routePath === 'users' && method === 'POST') {
    const handler = withAuth(withPermission('users', 'create')(
      async (req) => userHandlers.handleCreateUser(req)
    ))
    return handler(request, authService, pathSegments)
  }

  if (pathSegments[0] === 'users' && pathSegments.length === 2 && method === 'GET') {
    const userId = pathSegments[1]
    if (!isValidUserId(userId)) return jsonError('BAD_REQUEST', 'Invalid user id', 400)
    const handler = withAuth(withPermission('users', 'view')(
      async (req) => userHandlers.handleGetUser(req, userId)
    ))
    return handler(request, authService, pathSegments)
  }

  if (pathSegments[0] === 'users' && pathSegments.length === 2 && method === 'PUT') {
    const userId = pathSegments[1]
    if (!isValidUserId(userId)) return jsonError('BAD_REQUEST', 'Invalid user id', 400)
    const handler = withAuth(async (req, context) => {
      if (context.user.id === userId) {
        return userHandlers.handleUpdateOwnUser(req, userId)
      }

      return withPermission('users', 'edit')(
        async (request) => userHandlers.handleUpdateUser(request, userId)
      )(req, context, pathSegments)
    })
    return handler(request, authService, pathSegments)
  }

  if (pathSegments[0] === 'users' && pathSegments.length === 2 && method === 'DELETE') {
    const userId = pathSegments[1]
    if (!isValidUserId(userId)) return jsonError('BAD_REQUEST', 'Invalid user id', 400)
    const handler = withAuth(withPermission('users', 'delete')(
      async (req) => userHandlers.handleDeleteUser(req, userId)
    ))
    return handler(request, authService, pathSegments)
  }

  // POST /api/users/{id}/password — change password (validates current password)
  if (
    pathSegments[0] === 'users' &&
    pathSegments.length === 3 &&
    pathSegments[2] === 'password' &&
    method === 'POST'
  ) {
    const userId = pathSegments[1]
    if (!isValidUserId(userId)) return jsonError('BAD_REQUEST', 'Invalid user id', 400)
    const handler = withAuth(async (req, context) => {
      if (context.user.id === userId) {
        return userHandlers.handleChangePassword(req, userId)
      }

      return withPermission('users', 'edit')(
        async (request) => userHandlers.handleChangePassword(request, userId)
      )(req, context, pathSegments)
    })
    return handler(request, authService, pathSegments)
  }

  // --- Globals ---
  if (routePath === 'globals' && method === 'GET') {
    const handler = withAuth(withPermission('globals', 'view')(
      async () => globalHandlers.handleListGlobals()
    ))
    return handler(request, authService, pathSegments)
  }

  if (pathSegments[0] === 'globals' && pathSegments.length === 2 && method === 'GET') {
    const handle = pathSegments[1]
    const handler = withAuth(withPermission('globals', 'view')(
      async (req) => globalHandlers.handleGetGlobal(req, handle)
    ))
    return handler(request, authService, pathSegments)
  }

  if (pathSegments[0] === 'globals' && pathSegments.length === 2 && method === 'PUT') {
    const handle = pathSegments[1]
    const handler = withAuth(withPermission('globals', 'edit')(
      async (req) => globalHandlers.handleUpdateGlobal(req, handle)
    ))
    return handler(request, authService, pathSegments)
  }

  // --- Taxonomies ---
  if (routePath === 'taxonomies' && method === 'GET') {
    const handler = withAuth(withPermission('taxonomies', 'view')(
      async () => taxonomyHandlers.handleListTaxonomies()
    ))
    return handler(request, authService, pathSegments)
  }

  if (
    pathSegments[0] === 'taxonomies' &&
    pathSegments.length === 3 &&
    pathSegments[2] === 'terms' &&
    method === 'GET'
  ) {
    const taxonomyHandle = pathSegments[1]
    const handler = withAuth(withPermission('taxonomies', 'view')(
      async (req) => taxonomyHandlers.handleListTerms(req, taxonomyHandle)
    ))
    return handler(request, authService, pathSegments)
  }

  // --- Navigation ---
  if (routePath === 'navigation' && method === 'GET') {
    const handler = withAuth(withPermission('navigation', 'view')(
      async () => navigationHandlers.handleListNavigations()
    ))
    return handler(request, authService, pathSegments)
  }

  if (pathSegments[0] === 'navigation' && pathSegments.length === 2 && method === 'GET') {
    const handle = pathSegments[1]
    const handler = withAuth(withPermission('navigation', 'view')(
      async (req) => navigationHandlers.handleGetNavigation(req, handle)
    ))
    return handler(request, authService, pathSegments)
  }

  if (pathSegments[0] === 'navigation' && pathSegments.length === 2 && method === 'PUT') {
    const handle = pathSegments[1]
    const handler = withAuth(withPermission('navigation', 'edit')(
      async (req) => navigationHandlers.handleSaveNavigation(req, handle)
    ))
    return handler(request, authService, pathSegments)
  }

  // --- Forms ---
  if (routePath === 'forms' && method === 'GET') {
    const handler = withAuth(withPermission('forms', 'view')(
      async () => formHandlers.handleListForms()
    ))
    return handler(request, authService, pathSegments)
  }

  if (pathSegments[0] === 'forms' && pathSegments.length === 2 && method === 'GET') {
    const handle = pathSegments[1]
    const handler = withAuth(withPermission('forms', 'view')(
      async (req) => formHandlers.handleGetForm(req, handle)
    ))
    return handler(request, authService, pathSegments)
  }

  if (
    pathSegments[0] === 'forms' &&
    pathSegments.length === 3 &&
    pathSegments[2] === 'submit' &&
    method === 'POST'
  ) {
    const handle = pathSegments[1]
    return formHandlers.handleSubmitForm(request, handle)
  }

  // GET /api/forms/{handle}/submissions — paginated list
  if (
    pathSegments[0] === 'forms' &&
    pathSegments.length === 3 &&
    pathSegments[2] === 'submissions' &&
    method === 'GET'
  ) {
    const handle = pathSegments[1]
    const handler = withAuth(withPermission('forms', 'view')(
      async (req) => formHandlers.handleListSubmissions(req, handle)
    ))
    return handler(request, authService, pathSegments)
  }

  // GET /api/forms/{handle}/submissions/{id} — single submission
  if (
    pathSegments[0] === 'forms' &&
    pathSegments.length === 4 &&
    pathSegments[2] === 'submissions' &&
    method === 'GET'
  ) {
    const handle = pathSegments[1]
    const id = pathSegments[3]
    const handler = withAuth(withPermission('forms', 'view')(
      async (req) => formHandlers.handleGetSubmission(req, handle, id)
    ))
    return handler(request, authService, pathSegments)
  }

  // DELETE /api/forms/{handle}/submissions/{id} — delete submission
  if (
    pathSegments[0] === 'forms' &&
    pathSegments.length === 4 &&
    pathSegments[2] === 'submissions' &&
    method === 'DELETE'
  ) {
    const handle = pathSegments[1]
    const id = pathSegments[3]
    const handler = withAuth(withPermission('forms', 'delete')(
      async (req) => formHandlers.handleDeleteSubmission(req, handle, id)
    ))
    return handler(request, authService, pathSegments)
  }

  // GET /api/forms/{handle}/export/csv — CSV export
  if (
    pathSegments[0] === 'forms' &&
    pathSegments.length === 4 &&
    pathSegments[2] === 'export' &&
    pathSegments[3] === 'csv' &&
    method === 'GET'
  ) {
    const handle = pathSegments[1]
    const handler = withAuth(withPermission('forms', 'view')(
      async (req) => formHandlers.handleExportCsv(req, handle)
    ))
    return handler(request, authService, pathSegments)
  }

  // GET /api/forms/{handle}/export/json — JSON export
  if (
    pathSegments[0] === 'forms' &&
    pathSegments.length === 4 &&
    pathSegments[2] === 'export' &&
    pathSegments[3] === 'json' &&
    method === 'GET'
  ) {
    const handle = pathSegments[1]
    const handler = withAuth(withPermission('forms', 'view')(
      async (req) => formHandlers.handleExportJson(req, handle)
    ))
    return handler(request, authService, pathSegments)
  }

  // --- Settings ---
  // GET /api/settings/runtime — read runtime settings
  if (routePath === 'settings/runtime' && method === 'GET') {
    const handler = withAuth(withPermission('settings', 'view')(
      async () => {
        const settings = await runtimeSettingsService.read()
        return NextResponse.json({ data: settings })
      }
    ))
    return handler(request, authService, pathSegments)
  }

  // PUT /api/settings/runtime — write runtime settings
  if (routePath === 'settings/runtime' && method === 'PUT') {
    const handler = withAuth(withPermission('settings', 'edit')(
      async (req) => {
        const body = await req.json()
        await runtimeSettingsService.write(body)
        return NextResponse.json({ data: body, success: true })
      }
    ))
    return handler(request, authService, pathSegments)
  }

  // GET /api/settings/config — read madori config values
  if (routePath === 'settings/config' && method === 'GET') {
    const handler = withAuth(withPermission('settings', 'view')(
      async () => {
        const config = await madoriConfigService.readPublic()
        return NextResponse.json({ data: config })
      }
    ))
    return handler(request, authService, pathSegments)
  }

  // PUT /api/settings/config — write madori config values (restart required)
  if (routePath === 'settings/config' && method === 'PUT') {
    const handler = withAuth(withPermission('settings', 'edit')(
      async (req) => {
        const body = await req.json()
        const validation = await madoriConfigService.validateForWrite(body)
        if (!validation.valid) {
          return jsonError('VALIDATION_ERROR', 'Config validation failed', 422, validation.errors)
        }
        await madoriConfigService.write(body)
        return NextResponse.json({ data: body, success: true, restartRequired: true })
      }
    ))
    return handler(request, authService, pathSegments)
  }

  // --- Dashboard ---
  if (routePath === 'dashboard/recent' && method === 'GET') {
    const handler = withAuth(
      async (_req, context) => createDashboardHandlers(contentEngineInstance, async (handle) => context.authService.hasPermission(context.user, 'entries', 'view', handle) || context.authService.hasPermission(context.user, 'collections', 'view', handle)).handleRecentActivity()
    )
    return handler(request, authService, pathSegments)
  }

  // --- Collections (from config) ---
  if (routePath === 'collections' && method === 'GET') {
    const handler = withAuth(withPermission('collections', 'view')(
      async () => {
        const collections = await contentEngineInstance.listCollections()
        return NextResponse.json({ data: collections })
      }
    ))
    return handler(request, authService, pathSegments)
  }

  // GET /api/collections/{handle} — single collection config
  if (pathSegments[0] === 'collections' && pathSegments.length === 2 && method === 'GET') {
    const handle = pathSegments[1]
    const handler = withAuth(withPermission('collections', 'view')(
      async (req) => collectionHandlers.handleGetCollection(req, handle)
    ))
    return handler(request, authService, pathSegments)
  }

  // PUT /api/collections/{handle} — update collection config
  if (pathSegments[0] === 'collections' && pathSegments.length === 2 && method === 'PUT') {
    const handle = pathSegments[1]
    const handler = withAuth(withPermission('collections', 'edit')(
      async (req) => collectionHandlers.handleUpdateCollection(req, handle)
    ))
    return handler(request, authService, pathSegments)
  }

  // DELETE /api/collections/{handle} — delete collection config
  if (pathSegments[0] === 'collections' && pathSegments.length === 2 && method === 'DELETE') {
    const handle = pathSegments[1]
    const handler = withAuth(withPermission('collections', 'delete')(
      async (req) => collectionHandlers.handleDeleteCollection(req, handle)
    ))
    return handler(request, authService, pathSegments)
  }

  // --- Fieldsets ---
  if (routePath === 'fieldsets' && method === 'GET') {
    const handler = withAuth(withPermission('collections', 'view')(
      async () => {
        const fs = new NodeFileSystemAdapter()
        const parser = new MarkdownYamlParser()
        const fieldsetsDir = path.join(resolvedResourcesPath, 'fieldsets')
        const exists = await fs.exists(fieldsetsDir)
        if (!exists) {
          return NextResponse.json({ data: [] })
        }
        const files = await fs.listFiles(fieldsetsDir, '*.yaml')
        const data = await Promise.all(
          files.map(async (f) => {
            const handle = path.basename(f, path.extname(f))
            const filePath = path.join(fieldsetsDir, f)
            const content = await fs.readFile(filePath)
            const parsed = parser.parseYaml<{ is_block?: boolean; display?: string }>(content)
            return {
              handle,
              is_block: parsed.is_block ?? false,
              display: parsed.display ?? undefined,
            }
          })
        )
        return NextResponse.json({ data })
      }
    ))
    return handler(request, authService, pathSegments)
  }

  // GET /api/fieldsets/{handle}
  if (pathSegments[0] === 'fieldsets' && pathSegments.length === 2 && method === 'GET') {
    const handle = pathSegments[1]
    if (!isSafeHandle(handle)) return invalidHandleError()
    const handler = withAuth(withPermission('collections', 'view')(
      async () => {
        const fs = new NodeFileSystemAdapter()
        const parser = new MarkdownYamlParser()
        const filePath = path.join(resolvedResourcesPath, 'fieldsets', `${handle}.yaml`)
        const exists = await fs.exists(filePath)
        if (!exists) {
          return jsonError('NOT_FOUND', `Fieldset "${handle}" not found`, 404)
        }
        const content = await fs.readFile(filePath)
        const parsed = parser.parseYaml<{ fields: unknown[]; is_block?: boolean; display?: string }>(content)
        return NextResponse.json({
          data: {
            handle,
            fields: parsed.fields ?? [],
            is_block: parsed.is_block ?? false,
            display: parsed.display ?? undefined,
          },
        })
      }
    ))
    return handler(request, authService, pathSegments)
  }

  // PUT /api/fieldsets/{handle}
  if (pathSegments[0] === 'fieldsets' && pathSegments.length === 2 && method === 'PUT') {
    const handle = pathSegments[1]
    if (!isSafeHandle(handle)) return invalidHandleError()
    const handler = withAuth(withPermission('collections', 'edit')(
      async (req) => {
        const fs = new NodeFileSystemAdapter()
        const parser = new MarkdownYamlParser()
        const body = await req.json()
        if (!body.fields || !Array.isArray(body.fields)) {
          return jsonError('BAD_REQUEST', 'Fieldset must include a "fields" array', 400)
        }
        const dir = path.join(resolvedResourcesPath, 'fieldsets')
        await fs.mkdir(dir)
        const filePath = path.join(dir, `${handle}.yaml`)
        const yamlData: Record<string, unknown> = { fields: body.fields }
        if (body.is_block) {
          yamlData.is_block = true
        }
        if (body.display) {
          yamlData.display = body.display
        }
        const content = parser.serializeYaml(yamlData)
        const result = await new AtomicFileWriter(fs).writeFileAtomic(filePath, content)
        if (!result.success) {
          throw result.error ?? new Error(`Failed to save fieldset "${handle}"`)
        }
        ;(await getMadori()).mutationBus.report({ action: 'update', paths: [filePath], resource: { type: 'fieldset', id: handle }, message: `Updated fieldset ${handle}`, source: 'system', timestamp: Date.now() })
        return NextResponse.json({
          data: { handle, fields: body.fields, is_block: body.is_block ?? false, display: body.display ?? undefined },
        })
      }
    ))
    return handler(request, authService, pathSegments)
  }

  // DELETE /api/fieldsets/{handle}
  if (pathSegments[0] === 'fieldsets' && pathSegments.length === 2 && method === 'DELETE') {
    const handle = pathSegments[1]
    if (!isSafeHandle(handle)) return invalidHandleError()
    const handler = withAuth(withPermission('collections', 'delete')(
      async () => {
        const fs = new NodeFileSystemAdapter()
        const filePath = path.join(resolvedResourcesPath, 'fieldsets', `${handle}.yaml`)
        const exists = await fs.exists(filePath)
        if (!exists) {
          return jsonError('NOT_FOUND', `Fieldset "${handle}" not found`, 404)
        }
        const references = await findReferences(
          new RegExp(`\\bimport\\s*:\\s*['\"]?${escapeRegExp(handle)}(?:['\"]|\\s|$)`),
          [path.join(resolvedResourcesPath, 'blueprints'), path.join(resolvedResourcesPath, 'fieldsets')]
        )
        const externalReferences = references.filter((reference) => reference !== filePath)
        if (externalReferences.length > 0) {
          return jsonError(
            'CONFLICT',
            `Fieldset "${handle}" is used by ${externalReferences.length} file(s)`,
            409,
            { references: externalReferences }
          )
        }
        await fs.deleteFile(filePath)
        ;(await getMadori()).mutationBus.report({ action: 'delete', paths: [filePath], resource: { type: 'fieldset', id: handle }, message: `Deleted fieldset ${handle}`, source: 'system', timestamp: Date.now() })
        return NextResponse.json({ data: { deleted: true } })
      }
    ))
    return handler(request, authService, pathSegments)
  }

  // --- Blueprints ---
  // blueprints/{type} (GET = list all of type)
  if (pathSegments[0] === 'blueprints' && pathSegments.length === 2 && method === 'GET') {
    const type = pathSegments[1]
    const resource = resourceForEntityType(type)
    if (!resource) {
      return jsonError('BAD_REQUEST', `Invalid blueprint type: ${type}`, 400)
    }
    const handler = withAuth(withPermission(resource, 'view')(
      async () => {
        const blueprints = await blueprintRegistryInstance.listBlueprints(type as BlueprintType)
        return NextResponse.json({ data: blueprints })
      }
    ))
    return handler(request, authService, pathSegments)
  }

  // blueprints/{type}/{handle} (GET = single, PUT = save, DELETE = delete)
  if (pathSegments[0] === 'blueprints' && pathSegments.length === 3) {
    const type = pathSegments[1]
    const handle = pathSegments[2]
    if (!isSafeHandle(handle)) return invalidHandleError()
    const resource = resourceForEntityType(type)
    if (!resource) {
      return jsonError('BAD_REQUEST', `Invalid blueprint type: ${type}`, 400)
    }

    if (method === 'GET') {
      const handler = withAuth(withPermission(resource, 'view')(
        async () => {
          const blueprint = await blueprintRegistryInstance.getBlueprint(type as BlueprintType, handle)
          if (!blueprint) {
            return NextResponse.json(
              { error: { code: 'NOT_FOUND', message: `Blueprint "${type}/${handle}" not found` } },
              { status: 404 }
            )
          }
          return NextResponse.json({ data: blueprint })
        }
      ))
      return handler(request, authService, pathSegments)
    }

    if (method === 'PUT') {
      const handler = withAuth(async (req, context) => {
        const existing = await blueprintRegistryInstance.getBlueprint(type as BlueprintType, handle)
        const action: Action = existing ? 'edit' : 'create'
        return withPermission(resource, action)(
          async (authorisedRequest) => {
          const body = await authorisedRequest.json()
          const blueprint = body as Blueprint
          const validation = blueprintRegistryInstance.validateBlueprint(blueprint)
          if (!validation.success) {
            return jsonError('VALIDATION_ERROR', 'Invalid blueprint', 422, { errors: validation.errors })
          }
          if (type === 'forms') {
            const unsupported = requiredUnsupportedPublicFormFields(blueprint)
            if (unsupported.length) return jsonError('UNSUPPORTED_PUBLIC_FORM_FIELDS', 'Form blueprints cannot require field types without a public renderer.', 422, { fields: unsupported })
          }
          blueprint.handle = handle
          await blueprintRegistryInstance.saveBlueprint(type as BlueprintType, handle, blueprint)
          return NextResponse.json({ data: blueprint })
          }
        )(req, context, pathSegments)
      })
      return handler(request, authService, pathSegments)
    }

    if (method === 'DELETE') {
      const handler = withAuth(withPermission(resource, 'delete')(
        async () => {
          const references = await findReferences(
            new RegExp(`\\bblueprint\\s*:\\s*['\"]?${escapeRegExp(handle)}(?:['\"]|\\s|$)`),
            [path.join(process.cwd(), 'resources', type)]
          )
          if (references.length > 0) {
            return jsonError(
              'CONFLICT',
              `Blueprint "${type}/${handle}" is used by ${references.length} definition(s)`,
              409,
              { references }
            )
          }
          const deleted = await blueprintRegistryInstance.deleteBlueprint(type as BlueprintType, handle)
          if (!deleted) {
            return NextResponse.json(
              { error: { code: 'NOT_FOUND', message: `Blueprint "${type}/${handle}" not found` } },
              { status: 404 }
            )
          }
          return NextResponse.json({ data: { deleted: true } })
        }
      ))
      return handler(request, authService, pathSegments)
    }

    return methodNotAllowedError()
  }

  // --- Entries ---
  // entries/{collection} (GET = list, POST = create)
  if (pathSegments[0] === 'entries' && pathSegments.length === 2) {
    const collection = pathSegments[1]
    if (method === 'GET') {
      const handler = withAuth(withPermission('entries', 'view', collection)(
        async (req) => entryHandlers.handleListEntries(req, collection)
      ))
      return handler(request, authService, pathSegments)
    }
    if (method === 'POST') {
      const handler = withAuth(withPermission('entries', 'create', collection)(
        async (req) => entryHandlers.handleCreateEntry(req, collection)
      ))
      return handler(request, authService, pathSegments)
    }
    return methodNotAllowedError()
  }

  // entries/{collection}/{slug} (GET = single, PUT = update, DELETE = delete)
  if (pathSegments[0] === 'entries' && pathSegments.length === 3) {
    const collection = pathSegments[1]
    const slug = pathSegments[2]
    if (method === 'GET') {
      const handler = withAuth(withPermission('entries', 'view', collection)(
        async (req) => entryHandlers.handleGetEntry(req, collection, slug)
      ))
      return handler(request, authService, pathSegments)
    }
    if (method === 'PUT') {
      const handler = withAuth(withPermission('entries', 'edit', collection)(
        async (req) => entryHandlers.handleUpdateEntry(req, collection, slug)
      ))
      return handler(request, authService, pathSegments)
    }
    if (method === 'DELETE') {
      const handler = withAuth(withPermission('entries', 'delete', collection)(
        async (req) => entryHandlers.handleDeleteEntry(req, collection, slug)
      ))
      return handler(request, authService, pathSegments)
    }
    return methodNotAllowedError()
  }

  // --- Definitions (flat-file) ---
  // definitions/{type} (GET = list, POST = create)
  if (pathSegments[0] === 'definitions' && pathSegments.length === 2) {
    const entityType = pathSegments[1]
    const resource = resourceForEntityType(entityType)
    if (!resource) return jsonError('BAD_REQUEST', `Invalid definition type: ${entityType}`, 400)
    if (method === 'GET') {
      const handler = withAuth(withPermission(resource, 'view')(
        async (req) => definitionHandlers.handleListDefinitions(req, entityType)
      ))
      return handler(request, authService, pathSegments)
    }
    if (method === 'POST') {
      const handler = withAuth(withPermission(resource, 'create')(
        async (req) => definitionHandlers.handleCreateDefinition(req, entityType)
      ))
      return handler(request, authService, pathSegments)
    }
    return methodNotAllowedError()
  }

  // definitions/{type}/{handle} (GET = single, PUT = update, DELETE = delete)
  if (pathSegments[0] === 'definitions' && pathSegments.length === 3) {
    const entityType = pathSegments[1]
    const handle = pathSegments[2]
    const resource = resourceForEntityType(entityType)
    if (!resource) return jsonError('BAD_REQUEST', `Invalid definition type: ${entityType}`, 400)
    if (method === 'GET') {
      const handler = withAuth(withPermission(resource, 'view')(
        async (req) => definitionHandlers.handleGetDefinition(req, entityType, handle)
      ))
      return handler(request, authService, pathSegments)
    }
    if (method === 'PUT') {
      const handler = withAuth(withPermission(resource, 'edit')(
        async (req) => definitionHandlers.handleUpdateDefinition(req, entityType, handle)
      ))
      return handler(request, authService, pathSegments)
    }
    if (method === 'DELETE') {
      const handler = withAuth(withPermission(resource, 'delete')(
        async (req) => definitionHandlers.handleDeleteDefinition(req, entityType, handle)
      ))
      return handler(request, authService, pathSegments)
    }
    return methodNotAllowedError()
  }

  // --- Content (flat-file) ---
  // content/{type}/{handle} (GET = list entries, POST = create entry)
  if (pathSegments[0] === 'content' && pathSegments.length === 3) {
    const entityType = pathSegments[1]
    const handle = pathSegments[2]
    const resource = resourceForEntityType(entityType)
    if (!resource) return jsonError('BAD_REQUEST', `Invalid content type: ${entityType}`, 400)
    if (method === 'GET') {
      const handler = withAuth(withPermission(resource, 'view')(
        async (req) => contentHandlers.handleListContent(req, entityType, handle)
      ))
      return handler(request, authService, pathSegments)
    }
    if (method === 'POST') {
      const handler = withAuth(withPermission(resource, 'create')(
        async (req) => contentHandlers.handleCreateContent(req, entityType, handle)
      ))
      return handler(request, authService, pathSegments)
    }
    return methodNotAllowedError()
  }

  // content/{type}/{handle}/{entryId} (GET = single, PUT = update, DELETE = delete)
  if (pathSegments[0] === 'content' && pathSegments.length === 4) {
    const entityType = pathSegments[1]
    const handle = pathSegments[2]
    const entryId = pathSegments[3]
    const resource = resourceForEntityType(entityType)
    if (!resource) return jsonError('BAD_REQUEST', `Invalid content type: ${entityType}`, 400)
    if (method === 'GET') {
      const handler = withAuth(withPermission(resource, 'view')(
        async (req) => contentHandlers.handleGetContent(req, entityType, handle, entryId)
      ))
      return handler(request, authService, pathSegments)
    }
    if (method === 'PUT') {
      const handler = withAuth(withPermission(resource, 'edit')(
        async (req) => contentHandlers.handleUpdateContent(req, entityType, handle, entryId)
      ))
      return handler(request, authService, pathSegments)
    }
    if (method === 'DELETE') {
      const handler = withAuth(withPermission(resource, 'delete')(
        async (req) => contentHandlers.handleDeleteContent(req, entityType, handle, entryId)
      ))
      return handler(request, authService, pathSegments)
    }
    return methodNotAllowedError()
  }

  // All other routes return 404
  return notFoundError()
}

// --- Exported Next.js route handlers ---

interface RouteParams {
  params: Promise<{ path: string[] }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { path: pathSegments } = await params
  return dispatch(request, pathSegments)
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { path: pathSegments } = await params
  return dispatch(request, pathSegments)
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { path: pathSegments } = await params
  return dispatch(request, pathSegments)
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { path: pathSegments } = await params
  return dispatch(request, pathSegments)
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { path: pathSegments } = await params
  return dispatch(request, pathSegments)
}
