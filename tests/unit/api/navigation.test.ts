import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import { NextRequest } from 'next/server'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import { InMemoryContentCache } from '@/lib/cache/store'
import { NavigationOperations } from '@/lib/content/navigation'
import { DefinitionLoader } from '@/lib/definitions/loader'
import { createNavigationHandlers } from '@/app/(cp)/api/handlers/navigation'

describe('Navigation API Handlers', () => {
  let tmpDir: string
  let navigationOps: NavigationOperations
  let definitionLoader: DefinitionLoader
  let cache: InMemoryContentCache

  beforeEach(async () => {
    tmpDir = path.join(process.cwd(), 'tests', '.tmp', `nav-api-${Date.now()}`)
    const navDir = path.join(tmpDir, 'content', 'navigation')
    const resourcesDir = path.join(tmpDir, 'resources', 'navigations')
    await fs.mkdir(navDir, { recursive: true })
    await fs.mkdir(resourcesDir, { recursive: true })

    const adapter = new NodeFileSystemAdapter()
    const parser = new MarkdownYamlParser()
    cache = new InMemoryContentCache()
    navigationOps = new NavigationOperations(adapter, parser, cache, path.join(tmpDir, 'content'))
    definitionLoader = new DefinitionLoader(path.join(tmpDir, 'resources'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('GET /api/navigation/{handle}', () => {
    it('returns the navigation tree for an existing handle', async () => {
      const yaml = `items:\n  - label: Home\n    url: /\n  - label: Blog\n    url: /blog\n`
      await fs.writeFile(path.join(tmpDir, 'content', 'navigation', 'main.yaml'), yaml)

      const handlers = createNavigationHandlers(navigationOps, definitionLoader)
      const request = new NextRequest('http://localhost/api/navigation/main')
      const response = await handlers.handleGetNavigation(request, 'main')
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.data.handle).toBe('main')
      expect(json.data.items).toHaveLength(2)
      expect(json.data.items[0]).toEqual({ label: 'Home', url: '/' })
    })

    it('returns 404 for non-existent navigation', async () => {
      const handlers = createNavigationHandlers(navigationOps, definitionLoader)
      const request = new NextRequest('http://localhost/api/navigation/missing')
      const response = await handlers.handleGetNavigation(request, 'missing')
      const json = await response.json()

      expect(response.status).toBe(404)
      expect(json.error.code).toBe('NOT_FOUND')
    })
  })

  describe('PUT /api/navigation/{handle}', () => {
    it('saves a navigation tree and returns it', async () => {
      const handlers = createNavigationHandlers(navigationOps, definitionLoader)
      const body = {
        items: [
          { label: 'Home', url: '/' },
          { label: 'About', url: '/about' },
        ],
      }
      const request = new NextRequest('http://localhost/api/navigation/main', {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await handlers.handleSaveNavigation(request, 'main')
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.data.handle).toBe('main')
      expect(json.data.items).toHaveLength(2)
      expect(json.data.items[0]).toEqual({ label: 'Home', url: '/' })
      expect(json.data.items[1]).toEqual({ label: 'About', url: '/about' })

      // Verify file was written
      const savedContent = await fs.readFile(
        path.join(tmpDir, 'content', 'navigation', 'main.yaml'),
        'utf-8'
      )
      expect(savedContent).toContain('Home')
      expect(savedContent).toContain('About')
    })

    it('saves nested navigation trees', async () => {
      const handlers = createNavigationHandlers(navigationOps, definitionLoader)
      const body = {
        items: [
          {
            label: 'Docs',
            url: '/docs',
            children: [
              { label: 'Getting Started', url: '/docs/getting-started' },
              { label: 'API', url: '/docs/api' },
            ],
          },
        ],
      }
      const request = new NextRequest('http://localhost/api/navigation/main', {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await handlers.handleSaveNavigation(request, 'main')
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.data.items[0].children).toHaveLength(2)
      expect(json.data.items[0].children[0].label).toBe('Getting Started')
    })

    it('returns DEPTH_EXCEEDED when tree violates max_depth', async () => {
      // Create a navigation definition with max_depth: 1
      const defYaml = `title: Main Nav\nmax_depth: 1\n`
      await fs.writeFile(
        path.join(tmpDir, 'resources', 'navigations', 'main.yaml'),
        defYaml
      )

      const handlers = createNavigationHandlers(navigationOps, definitionLoader)
      const body = {
        items: [
          {
            label: 'Level 0',
            url: '/',
            children: [
              {
                label: 'Level 1',
                url: '/level-1',
                children: [{ label: 'Level 2', url: '/level-2' }],
              },
            ],
          },
        ],
      }
      const request = new NextRequest('http://localhost/api/navigation/main', {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await handlers.handleSaveNavigation(request, 'main')
      const json = await response.json()

      expect(response.status).toBe(422)
      expect(json.error.code).toBe('DEPTH_EXCEEDED')
      expect(json.error.maxDepth).toBe(1)
      expect(json.error.actualDepth).toBe(2)
    })

    it('allows saving when tree depth equals max_depth', async () => {
      // Create a navigation definition with max_depth: 2
      const defYaml = `title: Main Nav\nmax_depth: 2\n`
      await fs.writeFile(
        path.join(tmpDir, 'resources', 'navigations', 'main.yaml'),
        defYaml
      )

      const handlers = createNavigationHandlers(navigationOps, definitionLoader)
      const body = {
        items: [
          {
            label: 'Level 0',
            url: '/',
            children: [
              {
                label: 'Level 1',
                url: '/level-1',
                children: [{ label: 'Level 2', url: '/level-2' }],
              },
            ],
          },
        ],
      }
      const request = new NextRequest('http://localhost/api/navigation/main', {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await handlers.handleSaveNavigation(request, 'main')
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.data.handle).toBe('main')
    })

    it('allows saving when no definition exists (no max_depth constraint)', async () => {
      const handlers = createNavigationHandlers(navigationOps, definitionLoader)
      const body = {
        items: [
          {
            label: 'Deep',
            url: '/',
            children: [
              {
                label: 'Deeper',
                url: '/a',
                children: [
                  {
                    label: 'Deepest',
                    url: '/b',
                    children: [{ label: 'Way down', url: '/c' }],
                  },
                ],
              },
            ],
          },
        ],
      }
      const request = new NextRequest('http://localhost/api/navigation/footer', {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await handlers.handleSaveNavigation(request, 'footer')
      expect(response.status).toBe(200)
    })

    it('returns 422 when body has no items array', async () => {
      const handlers = createNavigationHandlers(navigationOps, definitionLoader)
      const request = new NextRequest('http://localhost/api/navigation/main', {
        method: 'PUT',
        body: JSON.stringify({ tree: [] }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await handlers.handleSaveNavigation(request, 'main')
      const json = await response.json()

      expect(response.status).toBe(422)
      expect(json.error.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 for invalid JSON body', async () => {
      const handlers = createNavigationHandlers(navigationOps, definitionLoader)
      const request = new NextRequest('http://localhost/api/navigation/main', {
        method: 'PUT',
        body: 'not json',
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await handlers.handleSaveNavigation(request, 'main')
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.error.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('NavigationOperations.saveNavigation', () => {
    it('persists items and returns them via getNavigation', async () => {
      const items = [
        { label: 'Home', url: '/' },
        { label: 'Contact', url: '/contact' },
      ]

      const result = await navigationOps.saveNavigation('test', items)
      expect(result.handle).toBe('test')
      expect(result.items).toEqual(items)

      // Clear cache to force re-read from disk
      cache.invalidate('navigation:test')
      const fetched = await navigationOps.getNavigation('test')
      expect(fetched).not.toBeNull()
      expect(fetched!.items).toHaveLength(2)
      expect(fetched!.items[0].label).toBe('Home')
    })

    it('invalidates the list cache after saving', async () => {
      // Populate list cache
      await navigationOps.listNavigations()

      // Save a new navigation
      await navigationOps.saveNavigation('new-nav', [{ label: 'New', url: '/new' }])

      // List should now include the new navigation (cache was invalidated)
      const list = await navigationOps.listNavigations()
      const handles = list.map((n) => n.handle)
      expect(handles).toContain('new-nav')
    })
  })
})
