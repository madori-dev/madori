import { createYoga } from 'graphql-yoga'
import { loadConfig, resolveConfigPaths } from '@/lib/config/loader'
import { SchemaGeneratorImpl } from '@/lib/graphql/schema-generator'
import { BlueprintRegistry } from '@/lib/blueprints/registry'
import { BlueprintLoader } from '@/lib/blueprints/loader'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import { InMemoryContentCache } from '@/lib/cache/store'
import { MadoriContentEngine } from '@/lib/content/engine'
import type { GraphQLContext } from '@/lib/graphql/resolvers'
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
  const schemaGenerator = new SchemaGeneratorImpl()

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

  let schema: GraphQLSchema
  if (validBlueprints.length > 0) {
    schema = schemaGenerator.generateSchema(validBlueprints, validCollections)
  } else {
    // Generate a minimal schema if no blueprints are found
    schema = schemaGenerator.generateSchema([], [])
  }

  // Create yoga instance
  yogaInstance = createYoga<GraphQLContext>({
    schema,
    graphqlEndpoint: resolvedConfig.graphql.path,
    fetchAPI: { Response },
    // Control introspection based on config
    ...(resolvedConfig.graphql.introspection ? {} : { maskedErrors: true }),
    context: () => ({
      contentEngine,
      blueprintRegistry,
    }),
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
