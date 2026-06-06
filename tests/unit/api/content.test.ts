import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { ContentStore } from '@/lib/content/store'
import { createContentHandlers } from '@/app/(cp)/api/handlers/content'

function makeRequest(method: string, body?: unknown): NextRequest {
  const url = 'http://localhost:3000/api/content/test'
  const init: RequestInit = { method }
  if (body) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  return new NextRequest(url, init)
}

describe('Content API Handler', () => {
  let tmpDir: string
  let contentStore: ContentStore
  let handlers: ReturnType<typeof createContentHandlers>

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-content-api-'))
    contentStore = new ContentStore(tmpDir)
    handlers = createContentHandlers(contentStore)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('handleListContent', () => {
    it('returns 422 for invalid entity type', async () => {
      const req = makeRequest('GET')
      const res = await handlers.handleListContent(req, 'invalid', 'test')
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.error).toContain('Invalid entity type')
    })

    it('returns empty array for taxonomies with no terms', async () => {
      const req = makeRequest('GET')
      const res = await handlers.handleListContent(req, 'taxonomies', 'tags')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toEqual([])
    })

    it('returns taxonomy terms list', async () => {
      // Create a taxonomy term
      const dir = path.join(tmpDir, 'taxonomies', 'tags')
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, 'javascript.yaml'), 'title: JavaScript\nslug: javascript\n')

      const req = makeRequest('GET')
      const res = await handlers.handleListContent(req, 'taxonomies', 'tags')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toHaveLength(1)
      expect(body.data[0].id).toBe('javascript')
      expect(body.data[0].title).toBe('JavaScript')
    })

    it('returns empty array for forms with no submissions', async () => {
      const req = makeRequest('GET')
      const res = await handlers.handleListContent(req, 'forms', 'contact')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toEqual([])
    })

    it('returns empty object for globals that do not exist', async () => {
      const req = makeRequest('GET')
      const res = await handlers.handleListContent(req, 'globals', 'seo')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toEqual({})
    })

    it('returns default navigation data for navigations that do not exist', async () => {
      const req = makeRequest('GET')
      const res = await handlers.handleListContent(req, 'navigations', 'main')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toEqual({ items: [] })
    })
  })

  describe('handleGetContent', () => {
    it('returns 422 for invalid entity type', async () => {
      const req = makeRequest('GET')
      const res = await handlers.handleGetContent(req, 'invalid', 'test', 'id1')
      expect(res.status).toBe(422)
    })

    it('returns 404 for nonexistent taxonomy term', async () => {
      const req = makeRequest('GET')
      const res = await handlers.handleGetContent(req, 'taxonomies', 'tags', 'nonexistent')
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toContain('not found')
    })

    it('returns 404 for nonexistent form submission', async () => {
      const req = makeRequest('GET')
      const res = await handlers.handleGetContent(req, 'forms', 'contact', 'nonexistent')
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toContain('not found')
    })

    it('returns taxonomy term by id', async () => {
      const dir = path.join(tmpDir, 'taxonomies', 'tags')
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, 'react.yaml'), 'title: React\n')

      const req = makeRequest('GET')
      const res = await handlers.handleGetContent(req, 'taxonomies', 'tags', 'react')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.id).toBe('react')
      expect(body.data.title).toBe('React')
    })

    it('returns global data', async () => {
      const dir = path.join(tmpDir, 'globals')
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, 'seo.yaml'), 'site_name: My Site\n')

      const req = makeRequest('GET')
      const res = await handlers.handleGetContent(req, 'globals', 'seo', 'any')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.site_name).toBe('My Site')
    })
  })

  describe('handleCreateContent', () => {
    it('returns 422 for invalid entity type', async () => {
      const req = makeRequest('POST', { slug: 'test', title: 'Test' })
      const res = await handlers.handleCreateContent(req, 'invalid', 'test')
      expect(res.status).toBe(422)
    })

    it('creates a taxonomy term and returns 201', async () => {
      const req = makeRequest('POST', { slug: 'vue', title: 'Vue.js' })
      const res = await handlers.handleCreateContent(req, 'taxonomies', 'tags')
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.id).toBe('vue')
      expect(body.data.title).toBe('Vue.js')
    })

    it('returns 422 when slug is missing for taxonomy term', async () => {
      const req = makeRequest('POST', { title: 'No Slug' })
      const res = await handlers.handleCreateContent(req, 'taxonomies', 'tags')
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.details?.slug).toBeDefined()
    })

    it('creates a form submission and returns 201', async () => {
      const req = makeRequest('POST', { name: 'John', email: 'john@example.com' })
      const res = await handlers.handleCreateContent(req, 'forms', 'contact')
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.id).toBeDefined()
      expect(body.data.name).toBe('John')
    })

    it('returns 422 for globals create', async () => {
      const req = makeRequest('POST', { title: 'Test' })
      const res = await handlers.handleCreateContent(req, 'globals', 'seo')
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.error).toContain('do not support create')
    })

    it('returns 422 for navigations create', async () => {
      const req = makeRequest('POST', { items: [] })
      const res = await handlers.handleCreateContent(req, 'navigations', 'main')
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.error).toContain('do not support create')
    })

    it('returns 422 with CONFLICT when taxonomy term slug already exists', async () => {
      // Create an existing term
      const dir = path.join(tmpDir, 'taxonomies', 'tags')
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, 'react.yaml'), 'title: React\n')

      const req = makeRequest('POST', { slug: 'react', title: 'React Duplicate' })
      const res = await handlers.handleCreateContent(req, 'taxonomies', 'tags')
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.error.code).toBe('CONFLICT')
      expect(body.error.message).toBe('A term with this slug already exists')
    })

    it('returns 422 for invalid JSON body', async () => {
      const url = 'http://localhost:3000/api/content/test'
      const req = new NextRequest(url, {
        method: 'POST',
        body: 'not valid json',
        headers: { 'Content-Type': 'application/json' },
      })
      const res = await handlers.handleCreateContent(req, 'taxonomies', 'tags')
      expect(res.status).toBe(422)
    })
  })

  describe('handleUpdateContent', () => {
    it('returns 422 for invalid entity type', async () => {
      const req = makeRequest('PUT', { title: 'Updated' })
      const res = await handlers.handleUpdateContent(req, 'invalid', 'test', 'id1')
      expect(res.status).toBe(422)
    })

    it('updates a taxonomy term and returns 200', async () => {
      // Create the term first
      const dir = path.join(tmpDir, 'taxonomies', 'tags')
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, 'react.yaml'), 'title: React\n')

      const req = makeRequest('PUT', { title: 'React.js' })
      const res = await handlers.handleUpdateContent(req, 'taxonomies', 'tags', 'react')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.id).toBe('react')
      expect(body.data.title).toBe('React.js')
    })

    it('updates a global and returns 200', async () => {
      const req = makeRequest('PUT', { site_name: 'Updated Site' })
      const res = await handlers.handleUpdateContent(req, 'globals', 'seo', 'any')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.site_name).toBe('Updated Site')
    })

    it('updates a navigation and returns 200', async () => {
      const req = makeRequest('PUT', { items: [{ title: 'Home', url: '/' }] })
      const res = await handlers.handleUpdateContent(req, 'navigations', 'main', 'any')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.items).toHaveLength(1)
      expect(body.data.items[0].title).toBe('Home')
    })

    it('returns 422 for form submission update', async () => {
      const req = makeRequest('PUT', { name: 'Updated' })
      const res = await handlers.handleUpdateContent(req, 'forms', 'contact', 'id1')
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.error).toContain('do not support update')
    })
  })

  describe('handleDeleteContent', () => {
    it('returns 422 for invalid entity type', async () => {
      const req = makeRequest('DELETE')
      const res = await handlers.handleDeleteContent(req, 'invalid', 'test', 'id1')
      expect(res.status).toBe(422)
    })

    it('deletes a taxonomy term and returns 204', async () => {
      // Create the term first
      const dir = path.join(tmpDir, 'taxonomies', 'tags')
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, 'react.yaml'), 'title: React\n')

      const req = makeRequest('DELETE')
      const res = await handlers.handleDeleteContent(req, 'taxonomies', 'tags', 'react')
      expect(res.status).toBe(204)

      // Verify it's gone
      const getReq = makeRequest('GET')
      const getRes = await handlers.handleGetContent(getReq, 'taxonomies', 'tags', 'react')
      expect(getRes.status).toBe(404)
    })

    it('deletes a form submission and returns 204', async () => {
      // Create a submission first
      const dir = path.join(tmpDir, 'forms', 'contact')
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, 'sub1.yaml'), 'name: John\n')

      const req = makeRequest('DELETE')
      const res = await handlers.handleDeleteContent(req, 'forms', 'contact', 'sub1')
      expect(res.status).toBe(204)
    })

    it('returns 422 for globals delete', async () => {
      const req = makeRequest('DELETE')
      const res = await handlers.handleDeleteContent(req, 'globals', 'seo', 'any')
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.error).toContain('do not support delete')
    })

    it('returns 422 for navigations delete', async () => {
      const req = makeRequest('DELETE')
      const res = await handlers.handleDeleteContent(req, 'navigations', 'main', 'any')
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.error).toContain('do not support delete')
    })
  })
})
