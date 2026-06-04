import { describe, it, expect, afterEach } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { discoverRoutes } from '@/lib/static-cache/cli/warm'

/**
 * Property 15: Cache warmer discovers all content routes
 * Validates: Requirements 10.2
 *
 * For any set of collections with entries, taxonomies with terms, and navigation
 * structures with URLs, the route discovery function SHALL return a superset of
 * all derivable routes from those content sources.
 */
describe('Property 15: Cache warmer discovers all content routes', () => {
  const tmpDirs: string[] = []

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true })
    }
    tmpDirs.length = 0
  })

  /**
   * Helper: create a temporary directory structure for testing route discovery.
   */
  async function setupFixture(options: {
    collections: Array<{
      handle: string
      route?: string
      entries: Array<{ slug: string; nestedPath?: string }>
    }>
    taxonomies: Array<{
      handle: string
      terms: string[]
    }>
    navigation: Array<{
      handle: string
      urls: string[]
    }>
  }): Promise<{ contentPath: string; resourcesPath: string }> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'route-discovery-'))
    tmpDirs.push(tmpDir)

    const contentPath = path.join(tmpDir, 'content')
    const resourcesPath = path.join(tmpDir, 'resources')

    // Create collection resources and content
    for (const col of options.collections) {
      // Resource definition
      const resourceDir = path.join(resourcesPath, 'collections')
      await fs.mkdir(resourceDir, { recursive: true })
      const config: Record<string, unknown> = { title: col.handle }
      if (col.route) config.route = col.route
      await fs.writeFile(
        path.join(resourceDir, `${col.handle}.yaml`),
        `title: ${col.handle}${col.route ? `\nroute: "${col.route}"` : ''}\n`
      )

      // Content entries
      const entriesDir = path.join(contentPath, 'collections', col.handle)
      await fs.mkdir(entriesDir, { recursive: true })
      for (const entry of col.entries) {
        const entryPath = entry.nestedPath
          ? path.join(entriesDir, entry.nestedPath, `${entry.slug}.md`)
          : path.join(entriesDir, `${entry.slug}.md`)
        await fs.mkdir(path.dirname(entryPath), { recursive: true })
        await fs.writeFile(entryPath, `---\ntitle: ${entry.slug}\nslug: ${entry.slug}\n---\n`)
      }
    }

    // Create taxonomy resources and content
    for (const tax of options.taxonomies) {
      // Resource definition
      const resourceDir = path.join(resourcesPath, 'taxonomies')
      await fs.mkdir(resourceDir, { recursive: true })
      await fs.writeFile(path.join(resourceDir, `${tax.handle}.yaml`), `title: ${tax.handle}\n`)

      // Content terms
      const termsDir = path.join(contentPath, 'taxonomies', tax.handle)
      await fs.mkdir(termsDir, { recursive: true })
      for (const term of tax.terms) {
        await fs.writeFile(path.join(termsDir, `${term}.yaml`), `title: ${term}\n`)
      }
    }

    // Create navigation content
    for (const nav of options.navigation) {
      const navDir = path.join(contentPath, 'navigation')
      await fs.mkdir(navDir, { recursive: true })

      const items = nav.urls.map((url) => `  - label: Link\n    url: ${url}`).join('\n')
      await fs.writeFile(path.join(navDir, `${nav.handle}.yaml`), `items:\n${items}\n`)
    }

    return { contentPath, resourcesPath }
  }

  // ─── Arbitraries ─────────────────────────────────────────────────────────────

  /** Generate a valid slug (alphanumeric + hyphens, non-empty) */
  const slugArb = fc
    .stringMatching(/^[a-z][a-z0-9-]{0,15}$/)
    .filter((s) => s.length > 0 && !s.endsWith('-'))

  /** Generate a collection handle */
  const collectionHandleArb = slugArb

  /** Generate a taxonomy handle */
  const taxonomyHandleArb = slugArb

  /** Generate an internal URL path */
  const internalUrlArb = fc
    .array(slugArb, { minLength: 1, maxLength: 3 })
    .map((parts) => `/${parts.join('/')}`)

  /** Generate a collection with entries */
  const collectionArb = fc.record({
    handle: collectionHandleArb,
    entries: fc.array(
      fc.record({ slug: slugArb }),
      { minLength: 1, maxLength: 4 }
    ),
  })

  /** Generate a taxonomy with terms */
  const taxonomyArb = fc.record({
    handle: taxonomyHandleArb,
    terms: fc.array(slugArb, { minLength: 1, maxLength: 4 }),
  })

  /** Generate a navigation structure with internal URLs */
  const navigationArb = fc.record({
    handle: slugArb,
    urls: fc.array(internalUrlArb, { minLength: 1, maxLength: 4 }),
  })

  /**
   * **Validates: Requirements 10.2**
   *
   * For any set of collections with entries, the discovered routes SHALL include
   * a route derived from each entry's slug.
   */
  it('discovers all collection entry routes', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(collectionArb, { minLength: 1, maxLength: 3 }),
        async (collections) => {
          const { contentPath, resourcesPath } = await setupFixture({
            collections,
            taxonomies: [],
            navigation: [],
          })

          const routes = await discoverRoutes({ contentPath, resourcesPath })

          // Every collection entry slug should produce a route
          for (const col of collections) {
            for (const entry of col.entries) {
              const expectedRoute = `/${entry.slug}`
              expect(routes).toContain(expectedRoute)
            }
          }
        }
      ),
      { numRuns: 20 }
    )
  })

  /**
   * **Validates: Requirements 10.2**
   *
   * For any set of taxonomies with terms, the discovered routes SHALL include
   * a route for each term in the form /{taxonomy}/{term}.
   */
  it('discovers all taxonomy term routes', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(taxonomyArb, { minLength: 1, maxLength: 3 }),
        async (taxonomies) => {
          const { contentPath, resourcesPath } = await setupFixture({
            collections: [],
            taxonomies,
            navigation: [],
          })

          const routes = await discoverRoutes({ contentPath, resourcesPath })

          // Every taxonomy term should produce a route
          for (const tax of taxonomies) {
            for (const term of tax.terms) {
              const expectedRoute = `/${tax.handle}/${term}`
              expect(routes).toContain(expectedRoute)
            }
          }
        }
      ),
      { numRuns: 20 }
    )
  })

  /**
   * **Validates: Requirements 10.2**
   *
   * For any set of navigation structures with internal URLs, the discovered
   * routes SHALL include all those URLs.
   */
  it('discovers all navigation URLs', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(navigationArb, { minLength: 1, maxLength: 3 }),
        async (navigation) => {
          const { contentPath, resourcesPath } = await setupFixture({
            collections: [],
            taxonomies: [],
            navigation,
          })

          const routes = await discoverRoutes({ contentPath, resourcesPath })

          // Every internal navigation URL should be discovered
          for (const nav of navigation) {
            for (const url of nav.urls) {
              expect(routes).toContain(url)
            }
          }
        }
      ),
      { numRuns: 20 }
    )
  })

  /**
   * **Validates: Requirements 10.2**
   *
   * For any combination of collections, taxonomies, and navigation structures,
   * the discovered routes SHALL be a superset of all derivable routes from all
   * three content sources combined.
   */
  it('discovers a superset of all content sources combined', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(collectionArb, { minLength: 0, maxLength: 2 }),
        fc.array(taxonomyArb, { minLength: 0, maxLength: 2 }),
        fc.array(navigationArb, { minLength: 0, maxLength: 2 }),
        async (collections, taxonomies, navigation) => {
          const { contentPath, resourcesPath } = await setupFixture({
            collections,
            taxonomies,
            navigation,
          })

          const routes = await discoverRoutes({ contentPath, resourcesPath })
          const routeSet = new Set(routes)

          // All collection entry routes should be present
          for (const col of collections) {
            for (const entry of col.entries) {
              expect(routeSet.has(`/${entry.slug}`)).toBe(true)
            }
          }

          // All taxonomy term routes should be present
          for (const tax of taxonomies) {
            for (const term of tax.terms) {
              expect(routeSet.has(`/${tax.handle}/${term}`)).toBe(true)
            }
          }

          // All navigation URLs should be present
          for (const nav of navigation) {
            for (const url of nav.urls) {
              expect(routeSet.has(url)).toBe(true)
            }
          }
        }
      ),
      { numRuns: 20 }
    )
  })

  /**
   * **Validates: Requirements 10.2**
   *
   * Collections with a route template should produce routes matching that template
   * with {slug} and {collection} placeholders replaced.
   */
  it('applies route templates when discovering collection routes', () => {
    fc.assert(
      fc.asyncProperty(
        collectionHandleArb,
        fc.array(fc.record({ slug: slugArb }), { minLength: 1, maxLength: 3 }),
        async (handle, entries) => {
          const routeTemplate = `/{collection}/{slug}`
          const { contentPath, resourcesPath } = await setupFixture({
            collections: [{ handle, route: routeTemplate, entries }],
            taxonomies: [],
            navigation: [],
          })

          const routes = await discoverRoutes({ contentPath, resourcesPath })

          for (const entry of entries) {
            const expectedRoute = `/${handle}/${entry.slug}`
            expect(routes).toContain(expectedRoute)
          }
        }
      ),
      { numRuns: 20 }
    )
  })
})
