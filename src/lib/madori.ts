/**
 * MADORI Singleton Module
 *
 * Lazily initializes all core services and exports them for use
 * by API routes, GraphQL handler, and Control Panel API.
 *
 * Call `getMadori()` to get the initialized service instances.
 * The first call triggers initialization; subsequent calls return
 * the cached instances.
 */

import { loadConfig, resolveConfigPaths } from '@/lib/config/loader'
import type { MadoriConfig } from '@/lib/config/schema'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import { InMemoryContentCache } from '@/lib/cache/store'
import { BlueprintLoader } from '@/lib/blueprints/loader'
import { BlueprintRegistry } from '@/lib/blueprints/registry'
import { MadoriContentEngine } from '@/lib/content/engine'
import { ChokidarFileWatcher } from '@/lib/cache/watcher'
import { ContentMutationBus } from '@/lib/mutations'
import { GitSyncRuntime } from '@/lib/git'
import { createContentEngineSeoPort, FileSeoAuditSnapshotStore, FileSeoRedirectRepository, FileSeoRepository, NotFoundObservationStore, SeoAuditEngine, SeoRuntime } from '@/lib/seo'
import { createSiteContexts, type SiteContext } from '@/lib/sites'
import { MadoriUrlResolver } from '@/lib/routing'
import { PermissionChecker } from '@/lib/auth/permissions'
import { PluginRegistry } from '@/lib/auth/registry'
import { YamlUserProviderFactory } from '@/lib/auth/providers/yaml'
import { FileSessionStoreFactory } from '@/lib/auth/stores/file'
import { PasswordAuthDriverFactory } from '@/lib/auth/drivers/password'
import { compose } from '@/lib/auth/composer'
import type { AuthConfig } from '@/lib/auth/composer'
import type { ContentEngine } from '@/lib/content/engine'
import type { FileWatcher } from '@/lib/cache/watcher'
import type { ContentCache } from '@/lib/cache/store'
import type { User } from '@/lib/auth/types'
import type { ResourceType, Action } from '@/lib/auth/permissions'
import * as path from 'path'

export interface MadoriInstance {
  config: MadoriConfig
  contentEngine: ContentEngine
  blueprintRegistry: BlueprintRegistry
  cache: ContentCache
  fileWatcher: FileWatcher
  mutationBus: ContentMutationBus
  gitRuntime: GitSyncRuntime
  seoRepository: FileSeoRepository
  seoRedirects: FileSeoRedirectRepository
  seoNotFound: NotFoundObservationStore
  seoRuntime: SeoRuntime
  seoAudit: SeoAuditEngine
  seoAuditSnapshots: FileSeoAuditSnapshotStore
  sites: SiteContext[]
  urlResolver: MadoriUrlResolver
  authService: AuthService
}

/**
 * Internal AuthService interface — adapts ComposedAuthService to a shape
 * consumed by consumers of getMadori() (password-based login, session
 * validation returning User, permission checking).
 */
interface AuthService {
  login(email: string, password: string): Promise<{ token: string; expiresAt: string }>
  logout(token: string): Promise<void>
  validateSession(token: string): Promise<User | null>
  createUser(input: { id: string; email: string; name: string; password: string; roles: string[] }): Promise<User>
  updateUser(id: string, input: { email?: string; name?: string; password?: string; roles?: string[]; lastLogin?: string }): Promise<User>
  deleteUser(id: string): Promise<void>
  hasPermission(user: User, resource: ResourceType, action: Action, scope?: string): Promise<boolean>
}

let instance: MadoriInstance | null = null
let initPromise: Promise<MadoriInstance> | null = null

/**
 * Returns the initialized MADORI singleton. The first call triggers
 * lazy initialization of all services; subsequent calls return the
 * cached instance.
 */
export async function getMadori(): Promise<MadoriInstance> {
  if (instance) return instance

  // Prevent concurrent initialization races
  if (!initPromise) {
    initPromise = initialize()
  }

  instance = await initPromise
  return instance
}

async function initialize(): Promise<MadoriInstance> {
  const projectRoot = process.cwd()

  // 1. Load and resolve config
  const rawConfig = await loadConfig(projectRoot)
  const config = resolveConfigPaths(rawConfig, projectRoot)

  // 2. Create file system adapter
  const fs = new NodeFileSystemAdapter()

  // 3. Create content parser
  const parser = new MarkdownYamlParser()

  // 4. Create content cache
  const cache = new InMemoryContentCache()

  // Create one publisher before composing any writer-backed service.
  const mutationBus = new ContentMutationBus()

  // Public URL identity and Git-versioned SEO settings share application config.
  const sites = createSiteContexts(config.sites, { trailingSlash: config.seo.trailingSlash })
  const urlResolver = new MadoriUrlResolver(config.seo.trailingSlash)
  const seoRepository = new FileSeoRepository(fs, parser, config.resourcesPath, mutationBus)
  const seoRedirects = new FileSeoRedirectRepository(fs, parser, config.contentPath, mutationBus, {
    allowedExternalOrigins: config.seo.allowedRedirectOrigins,
  })
  const seoNotFound = new NotFoundObservationStore(fs, config.seo.operationalStoragePath, {
    retentionDays: config.seo.reportRetentionDays,
  })
  const seoAudit = new SeoAuditEngine()
  const seoAuditSnapshots = new FileSeoAuditSnapshotStore(fs, config.seo.operationalStoragePath, {
    retentionDays: config.seo.reportRetentionDays,
    maxSnapshots: config.seo.reportSnapshotLimit,
  })

  // 5. Create blueprint loader and registry
  const blueprintLoader = new BlueprintLoader(fs, parser, config.resourcesPath, mutationBus)
  const blueprintRegistry = new BlueprintRegistry(blueprintLoader)

  // 6. Create content engine
  const contentEngine = new MadoriContentEngine(
    config,
    fs,
    parser,
    cache,
    blueprintRegistry,
    mutationBus
  )

  // 6b. Run startup orphan detection for atomic writes
  await contentEngine.init()

  const seoRuntime = new SeoRuntime({
    content: createContentEngineSeoPort(contentEngine),
    defaults: seoRepository,
    sites,
    urlResolver,
    features: config.seo,
    systemDefaults: { title: { kind: 'field', value: 'title' } },
    assets: {
      publicUrl(reference, site) {
        try {
          const absolute = new URL(reference)
          return (absolute.protocol === 'http:' || absolute.protocol === 'https:') && !absolute.username && !absolute.password
            ? absolute.toString()
            : null
        } catch {
          const assetPath = reference.startsWith('assets::')
            ? `/assets/${reference.slice('assets::'.length)}`
            : reference.startsWith('/') ? reference : `/assets/${reference}`
          try {
            return urlResolver.absolute(site, assetPath)
          } catch {
            return null
          }
        }
      },
    },
  })
  mutationBus.onMutation((mutation) => {
    const { type, handle, id } = mutation.resource
    if (type === 'entry' && handle && id) seoRuntime.invalidate({ records: [`collection:${handle}:${id}`] })
    else if (type === 'term' && handle && id) seoRuntime.invalidate({ records: [`taxonomy:${handle}:${id}`] })
    else if (type === 'asset' || type === 'asset-directory') seoRuntime.invalidate({ assets: ['*'] })
    else if (type === 'seo') seoRuntime.invalidate({ sites: ['*'], sections: ['*'] })
  })

  // 6c. Share one mutation publisher across write services and integrations.
  // Git work runs asynchronously, so a Git outage never makes content writes fail.
  const gitRuntime = new GitSyncRuntime(config, projectRoot)
  await gitRuntime.start(mutationBus)

  // 7. Create and start file watcher
  const fileWatcher = new ChokidarFileWatcher({
    cache,
    basePath: projectRoot,
    roots: [
      { name: 'content', path: config.contentPath },
      { name: 'resources', path: config.resourcesPath },
      { name: 'users', path: config.usersPath },
      { name: 'assets', path: config.assetsPath },
      ...config.git.trackedPaths.map((tracked, index) => ({
        name: `git-${index}` as const,
        path: tracked.root === 'content' ? config.contentPath
          : tracked.root === 'resources' ? config.resourcesPath
          : tracked.root === 'users' ? config.usersPath
          : tracked.root === 'assets' ? config.assetsPath
          : path.isAbsolute(tracked.root)
            ? tracked.root
            : `${projectRoot.replace(/[\\/]$/, '')}/${tracked.root}`,
      })),
    ],
  })
  fileWatcher.onFileChange((event) => { void gitRuntime.reportFilesystemChange(event.absolutePath) })
  await fileWatcher.start()

  // 8. Create auth services via adapter system
  const registry = new PluginRegistry()
  registry.registerProvider('yaml', new YamlUserProviderFactory(fs, parser, mutationBus))
  registry.registerStore('file', new FileSessionStoreFactory(fs))

  // PasswordAuthDriver needs a UserProvider — resolve and instantiate it first
  const providerFactory = registry.resolveProvider('yaml')
  const userProvider = providerFactory.create({ usersPath: config.usersPath })
  registry.registerDriver('password', new PasswordAuthDriverFactory(userProvider))

  const authConfig: AuthConfig = {
    driver: 'password',
    store: 'file',
    provider: 'yaml',
    storeConfig: {
      sessionsDir: path.join(config.contentPath, '../.sessions'),
    },
    providerConfig: {
      usersPath: config.usersPath,
    },
  }

  const composedAuth = compose(registry, authConfig)
  const permissionChecker = new PermissionChecker(fs, parser, config.resourcesPath)

  // Adapt ComposedAuthService to the AuthService interface
  const authService: AuthService = {
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
        return await composedAuth.getUser(session.userId)
      } catch {
        return null
      }
    },
    async createUser(input) {
      return composedAuth.createUser(input)
    },
    async updateUser(id, input) {
      return composedAuth.updateUser(id, input)
    },
    async deleteUser(id) {
      return composedAuth.deleteUser(id)
    },
    async hasPermission(user: User, resource: ResourceType, action: Action, scope?: string) {
      return permissionChecker.hasPermission(user.roles, resource, action, scope)
    },
  }

  return {
    config,
    contentEngine,
    blueprintRegistry,
    cache,
    fileWatcher,
    mutationBus,
    gitRuntime,
    seoRepository,
    seoRedirects,
    seoNotFound,
    seoRuntime,
    seoAudit,
    seoAuditSnapshots,
    sites,
    urlResolver,
    authService,
  }
}

/**
 * Gracefully shuts down the MADORI singleton.
 * Stops the file watcher and clears the cached instance.
 */
export async function shutdownMadori(): Promise<void> {
  if (instance) {
    await instance.fileWatcher.stop()
    instance.gitRuntime.stop()
    instance = null
    initPromise = null
  }
}

// Register process shutdown handlers for graceful cleanup
if (typeof process !== 'undefined') {
  const handleShutdown = () => {
    if (instance) {
      void instance.fileWatcher.stop()
      instance.gitRuntime.stop()
    }
  }

  process.on('SIGTERM', handleShutdown)
  process.on('SIGINT', handleShutdown)
}
