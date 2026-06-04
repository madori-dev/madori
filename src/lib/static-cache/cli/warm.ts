import * as fs from 'fs/promises'
import * as path from 'path'
import matter from 'gray-matter'
import { parse as parseYaml } from 'yaml'

export interface WarmOptions {
  concurrency: number
  baseUrl: string
  contentPath: string
  resourcesPath: string
}

export interface WarmResult {
  total: number
  succeeded: number
  failed: number
  errors: Array<{ url: string; error: string }>
}

export interface RouteDiscoveryOptions {
  contentPath: string
  resourcesPath: string
}

/**
 * Discover all known routes from collections, taxonomies, and navigation structures.
 * Reads the filesystem directly to build a complete route list for cache warming.
 */
export async function discoverRoutes(options: RouteDiscoveryOptions): Promise<string[]> {
  const routes = new Set<string>()

  const [collectionRoutes, taxonomyRoutes, navigationRoutes] = await Promise.all([
    discoverCollectionRoutes(options.contentPath, options.resourcesPath),
    discoverTaxonomyRoutes(options.contentPath, options.resourcesPath),
    discoverNavigationRoutes(options.contentPath),
  ])

  for (const route of collectionRoutes) routes.add(route)
  for (const route of taxonomyRoutes) routes.add(route)
  for (const route of navigationRoutes) routes.add(route)

  return [...routes]
}

/**
 * Discover routes from collection entries by reading markdown files
 * and extracting their slug frontmatter field.
 *
 * Collection entries are stored at: content/collections/{collection}/{slug}.md
 * The slug field in frontmatter defines the route (e.g., slug: "docs/collections" → /docs/collections).
 */
async function discoverCollectionRoutes(
  contentPath: string,
  resourcesPath: string
): Promise<string[]> {
  const routes: string[] = []

  // Read collection definitions from resources/collections/
  const collectionsDir = path.join(resourcesPath, 'collections')
  const collectionFiles = await listYamlFiles(collectionsDir)

  for (const file of collectionFiles) {
    const handle = path.basename(file, '.yaml')

    // Read collection config for optional route template
    const configPath = path.join(collectionsDir, file)
    const configRaw = await safeReadFile(configPath)
    const config = configRaw ? (parseYaml(configRaw) as Record<string, unknown> | null) : null
    const routeTemplate = config?.route as string | undefined

    // Read all entry files in the collection's content directory
    const entriesDir = path.join(contentPath, 'collections', handle)
    const entryFiles = await listMarkdownFilesRecursive(entriesDir)

    for (const entryFile of entryFiles) {
      const route = await resolveEntryRoute(entryFile, entriesDir, handle, routeTemplate)
      if (route) routes.push(route)
    }
  }

  return routes
}

/**
 * Resolve the route for a collection entry.
 * Uses the slug from frontmatter if available, otherwise derives from file path.
 * If the collection has a route template, applies it.
 */
async function resolveEntryRoute(
  filePath: string,
  entriesDir: string,
  collectionHandle: string,
  routeTemplate?: string
): Promise<string | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    const { data } = matter(raw)

    // Use slug from frontmatter, or derive from relative file path
    const slug = data.slug as string | undefined
    const relativePath = path.relative(entriesDir, filePath)
    const derivedSlug = relativePath.replace(/\.md$/, '').replace(/\\/g, '/')

    const entrySlug = slug || derivedSlug

    if (routeTemplate) {
      // Replace route template placeholders
      return routeTemplate
        .replace('{slug}', entrySlug)
        .replace('{collection}', collectionHandle)
    }

    // Default: route is /{slug}
    return `/${entrySlug}`
  } catch {
    return null
  }
}

/**
 * Discover routes from taxonomy terms.
 * Terms are stored at: content/taxonomies/{taxonomy}/{slug}.yaml
 * Routes follow the pattern: /{taxonomy}/{slug}
 */
async function discoverTaxonomyRoutes(
  contentPath: string,
  resourcesPath: string
): Promise<string[]> {
  const routes: string[] = []

  // Read taxonomy definitions from resources/taxonomies/
  const taxonomiesDefDir = path.join(resourcesPath, 'taxonomies')
  const taxonomyFiles = await listYamlFiles(taxonomiesDefDir)

  for (const file of taxonomyFiles) {
    const handle = path.basename(file, '.yaml')

    // Read term files from content/taxonomies/{handle}/
    const termsDir = path.join(contentPath, 'taxonomies', handle)
    const termFiles = await listYamlFiles(termsDir)

    for (const termFile of termFiles) {
      const slug = path.basename(termFile, '.yaml')
      routes.push(`/${handle}/${slug}`)
    }
  }

  return routes
}

/**
 * Discover routes from navigation structures.
 * Navigation files are stored at: content/navigation/{handle}.yaml
 * Each item may have a `url` field pointing to an internal route.
 * External URLs (http/https or marked external) are excluded.
 */
async function discoverNavigationRoutes(contentPath: string): Promise<string[]> {
  const routes: string[] = []

  const navDir = path.join(contentPath, 'navigation')
  const navFiles = await listYamlFiles(navDir)

  for (const file of navFiles) {
    const filePath = path.join(navDir, file)
    const raw = await safeReadFile(filePath)
    if (!raw) continue

    const data = parseYaml(raw) as { items?: unknown[] } | null
    if (data?.items && Array.isArray(data.items)) {
      extractNavigationUrls(data.items, routes)
    }
  }

  return routes
}

/**
 * Recursively extract internal URLs from navigation items.
 * Skips external links (starting with http:// or https://, or marked external: true).
 */
function extractNavigationUrls(items: unknown[], routes: string[]): void {
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue

    const obj = item as Record<string, unknown>
    const url = obj.url as string | undefined
    const external = obj.external as boolean | undefined

    if (url && !external && !url.startsWith('http://') && !url.startsWith('https://')) {
      routes.push(url)
    }

    if (Array.isArray(obj.children)) {
      extractNavigationUrls(obj.children, routes)
    }
  }
}

// ─── Filesystem Helpers ──────────────────────────────────────────────────────

async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch {
    return null
  }
}

async function listYamlFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir)
    return entries.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
  } catch {
    return []
  }
}

async function listMarkdownFilesRecursive(dir: string): Promise<string[]> {
  const results: string[] = []

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        const nested = await listMarkdownFilesRecursive(fullPath)
        results.push(...nested)
      } else if (entry.name.endsWith('.md')) {
        results.push(fullPath)
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return results
}

// ─── Cache Warming ───────────────────────────────────────────────────────────

/**
 * Warm the static cache by discovering all routes and making HTTP GET requests
 * to each one. Processes routes with configurable concurrency and continues
 * on individual failures.
 */
export async function warmCache(options: WarmOptions): Promise<WarmResult> {
  const routes = await discoverRoutes({
    contentPath: options.contentPath,
    resourcesPath: options.resourcesPath,
  })

  const result: WarmResult = {
    total: routes.length,
    succeeded: 0,
    failed: 0,
    errors: [],
  }

  if (routes.length === 0) {
    return result
  }

  // Process routes with concurrency limit using a shared queue
  const queue = [...routes]
  const workers = Array.from({ length: Math.min(options.concurrency, routes.length) }, () =>
    processQueue(queue, options.baseUrl, result)
  )
  await Promise.all(workers)

  return result
}

/**
 * Worker that pulls routes from a shared queue and warms them one at a time.
 * Continues processing on individual route failures.
 */
async function processQueue(
  queue: string[],
  baseUrl: string,
  result: WarmResult
): Promise<void> {
  while (queue.length > 0) {
    const route = queue.shift()
    if (!route) break

    try {
      const url = new URL(route, baseUrl).toString()
      const response = await fetch(url, { method: 'GET' })

      if (response.ok) {
        result.succeeded++
        console.log(`  ✓ ${route}`)
      } else {
        result.failed++
        const errorMsg = `HTTP ${response.status} ${response.statusText}`
        result.errors.push({ url: route, error: errorMsg })
        console.log(`  ✗ ${route} — ${errorMsg}`)
      }
    } catch (err) {
      result.failed++
      const errorMsg = err instanceof Error ? err.message : String(err)
      result.errors.push({ url: route, error: errorMsg })
      console.log(`  ✗ ${route} — ${errorMsg}`)
    }
  }
}

// ─── CLI Entry Point ─────────────────────────────────────────────────────────

function parseArgs(args: string[]): { concurrency: number; baseUrl: string } {
  let concurrency = 3
  let baseUrl = 'http://localhost:3000'

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--concurrency' && args[i + 1]) {
      const parsed = parseInt(args[i + 1], 10)
      if (!isNaN(parsed) && parsed > 0) {
        concurrency = parsed
      }
      i++
    } else if (args[i] === '--base-url' && args[i + 1]) {
      baseUrl = args[i + 1]
      i++
    }
  }

  return { concurrency, baseUrl }
}

async function loadConfig(): Promise<{ contentPath: string; resourcesPath: string }> {
  try {
    const configPath = path.resolve(process.cwd(), 'madori.config.ts')
    const mod = await import(configPath)
    const config = mod.default || mod
    return {
      contentPath: config.contentPath || './content',
      resourcesPath: config.resourcesPath || './resources',
    }
  } catch {
    return {
      contentPath: './content',
      resourcesPath: './resources',
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const { concurrency, baseUrl } = parseArgs(args)

  console.log(`Warming static cache...`)
  console.log(`  Base URL: ${baseUrl}`)
  console.log(`  Concurrency: ${concurrency}`)
  console.log('')

  const { contentPath, resourcesPath } = await loadConfig()

  const result = await warmCache({
    concurrency,
    baseUrl,
    contentPath,
    resourcesPath,
  })

  console.log('')
  console.log(`Done! ${result.succeeded} pages warmed, ${result.failed} failures out of ${result.total} total routes.`)

  if (result.errors.length > 0) {
    console.log('')
    console.log('Failures:')
    for (const { url, error } of result.errors) {
      console.log(`  ${url}: ${error}`)
    }
  }

  process.exit(result.failed > 0 ? 1 : 0)
}

// Run CLI when executed directly
main().catch((err) => {
  console.error('Cache warm failed:', err)
  process.exit(1)
})
