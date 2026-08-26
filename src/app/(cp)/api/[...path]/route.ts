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
import { DefinitionRepository } from '@/lib/blueprints/repository'
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
import { createFormHandlers } from '../handlers/forms'
import { createEntryHandlers } from '../handlers/entries'
import { createCollectionHandlers } from '../handlers/collections'
import { createDefinitionHandlers } from '../handlers/definitions'
import { createContentHandlers } from '../handlers/content'
import { createDashboardHandlers } from '../handlers/dashboard'
import { DefinitionLoader } from '@/lib/definitions/loader'
import { ContentStore } from '@/lib/content/store'
import { initInvalidationEngine } from '@/lib/static-cache/instance'
import { RuntimeSettingsService } from '@/lib/settings/runtime'
import { MadoriConfigService } from '@/lib/settings/config'
import type { User, CreateUserInput, UpdateUserInput } from '@/lib/auth/types'
import type { ResourceType, Action } from '@/lib/auth/permissions'
import { AuthenticationError, AuthorizationError as AuthorizationErr } from '@/lib/errors'
import { getMadori } from '@/lib/madori'
import { z } from 'zod'
import { createGitRouteFamily } from '../routes/git'
import { createSeoRouteFamily } from '../routes/seo'
import { createSettingsRouteFamily } from '../routes/settings'
import { createDefinitionRouteFamily } from '../routes/definitions'
import type { RunAuthenticatedRoute } from '../routes/contracts'
import { SlidingWindowRateLimiter } from '@/lib/security/rate-limiter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LOGIN_WINDOW_MS = 5 * 60 * 1000
const loginAccounts = new SlidingWindowRateLimiter(10, LOGIN_WINDOW_MS)

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
let definitionRepository: DefinitionRepository

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
  definitionRepository = new DefinitionRepository(fs, parser, resolvedConfig.resourcesPath, mutationBus)
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
  let accountKey: string | null = null
  try {
    const body = await request.json()
    const { email, password } = body

    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return jsonError('VALIDATION_ERROR', 'Email and password are required', 422)
    }

    accountKey = email.trim().toLowerCase()
    const accountDecision = loginAccounts.consume(accountKey)
    if (!accountDecision.allowed) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again shortly.' } },
        {
          status: 429,
          headers: { 'Retry-After': String(accountDecision.retryAfterSeconds) },
        },
      )
    }

    const session = await authService.login(email, password)
    loginAccounts.reset(accountKey)

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

function authenticatedRunner(authService: AuthService): RunAuthenticatedRoute {
  return (request, pathSegments, permission, handler) => {
    let routeHandler: RouteHandler = (req, context) => handler(req, {
      user: context.user,
      hasPermission: (resource, action, scope) => context.authService.hasPermission(context.user, resource, action, scope),
    })
    if (permission) {
      routeHandler = withPermission(permission.resource, permission.action, permission.scope)(routeHandler)
    }
    return withAuth(routeHandler)(request, authService, pathSegments)
  }
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

  const runAuthenticated = authenticatedRunner(authService)
  const family = pathSegments[0] === 'git'
    ? createGitRouteFamily(runAuthenticated)
    : pathSegments[0] === 'seo'
      ? createSeoRouteFamily(runAuthenticated)
      : pathSegments[0] === 'settings'
        ? createSettingsRouteFamily({ runtime: runtimeSettingsService, config: madoriConfigService, runAuthenticated })
        : ['definitions', 'fieldsets', 'blueprints'].includes(pathSegments[0])
          ? createDefinitionRouteFamily({ repository: definitionRepository, handlers: definitionHandlers, runAuthenticated })
          : null
  if (family) return (await family(request, pathSegments)) ?? notFoundError()

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
