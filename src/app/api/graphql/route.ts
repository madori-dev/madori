import { createYoga } from 'graphql-yoga'
import * as path from 'path'
import { loadConfig, resolveConfigPaths } from '@/lib/config/loader'
import { SchemaGeneratorImpl } from '@/lib/graphql/schema-generator'
import type { FieldsetProvider } from '@/lib/graphql/schema-generator'
import { buildResolvers } from '@/lib/graphql/resolvers'
import { BlueprintRegistry } from '@/lib/blueprints/registry'
import { BlueprintLoader } from '@/lib/blueprints/loader'
import { FieldsetResolver } from '@/lib/blueprints/fieldsets'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import { InMemoryContentCache } from '@/lib/cache/store'
import { MadoriContentEngine } from '@/lib/content/engine'
import { PermissionChecker } from '@/lib/auth/permissions'
import { PermissionGuard } from '@/lib/auth/guard'
import { PluginRegistry } from '@/lib/auth/registry'
import { YamlUserProviderFactory } from '@/lib/auth/providers/yaml'
import { FileSessionStoreFactory } from '@/lib/auth/stores/file'
import { PasswordAuthDriverFactory } from '@/lib/auth/drivers/password'
import { compose } from '@/lib/auth/composer'
import type { ComposedAuthService, AuthConfig } from '@/lib/auth/composer'
import type { AuthContext } from '@/lib/auth/guard'
import type { GraphQLContext } from '@/lib/graphql/resolvers'
import type { FieldDefinition } from '@/lib/blueprints/types'
import type { GraphQLSchema } from 'graphql'

/**
 * Lazily initialized yoga instance.
 * On first request, loads config, creates instances, generates schema, and caches the yoga handler.
 */
let yogaInstance: ReturnType<typeof createYoga<GraphQLContext>> | null = null

async function getYoga() {
  if (yogaInstance) return yogaInstance

  // Load and resolve config
  const config = await loadConfig()
  const resolvedConfig = resolveConfigPaths(config, process.cwd())

  // Create core dependencies
  const fs = new NodeFileSystemAdapter()
  const parser = new MarkdownYamlParser()
  const cache = new InMemoryContentCache()
  const blueprintLoader = new BlueprintLoader(fs, parser, resolvedConfig.resourcesPath)
  const blueprintRegistry = new BlueprintRegistry(blueprintLoader)

  // Create content engine
  const contentEngine = new MadoriContentEngine(
    resolvedConfig,
    fs,
    parser,
    cache,
    blueprintRegistry
  )

  // Generate GraphQL schema from blueprints and collection configs
  // Pre-resolve fieldsets so replicator/grid fields get structured types
  const fieldsetResolver = new FieldsetResolver(fs, parser, resolvedConfig.resourcesPath)
  const fieldsetCache = new Map<string, FieldDefinition[]>()

  // Discover all fieldset files and pre-load them
  const fieldsetsDir = `${resolvedConfig.resourcesPath}/fieldsets`
  const fieldsetsExist = await fs.exists(fieldsetsDir)
  if (fieldsetsExist) {
    const fieldsetFiles = await fs.listFiles(fieldsetsDir, '*.yaml')
    for (const file of fieldsetFiles) {
      const handle = file.replace(/\.yaml$/, '').split('/').pop()!
      try {
        const fields = await fieldsetResolver.loadFieldset(handle)
        fieldsetCache.set(handle, fields)
      } catch {
        // Skip unresolvable fieldsets (missing dependencies, circular refs)
      }
    }
  }

  const fieldsetProvider: FieldsetProvider = {
    getFieldset(handle: string) {
      return fieldsetCache.get(handle)
    },
  }

  const schemaGenerator = new SchemaGeneratorImpl(fieldsetProvider)

  // Discover collections from blueprint registry (flat-file based)
  const collectionBlueprints = await blueprintRegistry.listBlueprints('collections')
  const collectionConfigs = collectionBlueprints.map((bp) => ({
    title: bp.handle.charAt(0).toUpperCase() + bp.handle.slice(1),
    handle: bp.handle,
    blueprint: bp.handle,
  }))

  const blueprints = await Promise.all(
    collectionConfigs.map(async (col) => {
      const bp = await blueprintRegistry.getBlueprint('collections', col.blueprint)
      return bp
    })
  )

  // Filter out null blueprints (missing blueprint files)
  const validBlueprints = blueprints.filter((bp): bp is NonNullable<typeof bp> => bp !== null)
  const validCollections = collectionConfigs.filter((_col, i) => blueprints[i] !== null)

  // Create PermissionGuard for GraphQL resolver access control
  const permissionChecker = new PermissionChecker(fs, parser, resolvedConfig.resourcesPath)
  const guard = new PermissionGuard(permissionChecker, { permissions: new Map() })

  // Compose auth service for session validation in GraphQL context
  const registry = new PluginRegistry()
  registry.registerProvider('yaml', new YamlUserProviderFactory(fs, parser))
  registry.registerStore('file', new FileSessionStoreFactory(fs))

  const providerFactory = registry.resolveProvider(config.auth?.provider ?? 'yaml')
  const userProvider = providerFactory.create({
    usersPath: resolvedConfig.usersPath,
  })
  registry.registerDriver('password', new PasswordAuthDriverFactory(userProvider))

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

  const composedAuth: ComposedAuthService = compose(registry, authConfig)

  // Build resolvers with permission guard wrapping
  const resolvers = buildResolvers(validCollections, { guard })

  let schema: GraphQLSchema
  if (validBlueprints.length > 0) {
    schema = schemaGenerator.generateSchema(validBlueprints, validCollections, resolvers)
  } else {
    // Generate a minimal schema if no blueprints are found
    schema = schemaGenerator.generateSchema([], [], resolvers)
  }

  // Create yoga instance
  yogaInstance = createYoga<GraphQLContext>({
    schema,
    graphqlEndpoint: resolvedConfig.graphql.path,
    fetchAPI: { Response },
    // Control introspection based on config
    ...(resolvedConfig.graphql.introspection ? {} : { maskedErrors: true }),
    context: async ({ request }) => {
      // Extract auth context from request (Bearer token or cookie)
      let auth: AuthContext | null = null
      const authHeader = request.headers.get('authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7)
        const session = await composedAuth?.validateSession(token)
        if (session) {
          const user = await composedAuth?.getUser(session.userId)
          if (user) {
            auth = { userId: user.id, roles: user.roles }
          }
        }
      }

      return {
        contentEngine,
        blueprintRegistry,
        auth,
      }
    },
  })

  return yogaInstance
}

/**
 * Handle GET requests (GraphiQL UI in development, queries via query params).
 */
export async function GET(request: Request) {
  const yoga = await getYoga()
  return yoga.handle(request)
}

/**
 * Handle POST requests (standard GraphQL queries and mutations).
 */
export async function POST(request: Request) {
  const yoga = await getYoga()
  return yoga.handle(request)
}
