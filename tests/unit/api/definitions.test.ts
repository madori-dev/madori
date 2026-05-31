import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createDefinitionHandlers } from '@/app/(cp)/api/handlers/definitions'
import { DefinitionLoader } from '@/lib/definitions/loader'
import { DefinitionNotFoundError } from '@/lib/definitions/errors'

// Mock the DefinitionLoader
vi.mock('@/lib/definitions/loader')

function makeRequest(method: string, body?: unknown): NextRequest {
  const init: RequestInit = { method }
  if (body) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  return new NextRequest('http://localhost/api/definitions/taxonomies', init)
}

describe('createDefinitionHandlers', () => {
  let loader: DefinitionLoader
  let handlers: ReturnType<typeof createDefinitionHandlers>

  beforeEach(() => {
    loader = new DefinitionLoader('/tmp/resources')
    handlers = createDefinitionHandlers(loader)
  })

  describe('handleListDefinitions', () => {
    it('returns 422 for invalid entity type', async () => {
      const req = makeRequest('GET')
      const res = await handlers.handleListDefinitions(req, 'invalid')
      const json = await res.json()

      expect(res.status).toBe(422)
      expect(json.error).toContain('Invalid entity type')
      expect(json.details.entityType).toBeDefined()
    })

    it('returns 200 with array of definitions', async () => {
      const map = new Map([
        ['blog-tags', { title: 'Blog Tags' }],
        ['categories', { title: 'Categories', blueprint: 'categories' }],
      ])
      vi.mocked(loader.loadAll).mockResolvedValue(map as Map<string, unknown>)

      const req = makeRequest('GET')
      const res = await handlers.handleListDefinitions(req, 'taxonomies')
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.data).toHaveLength(2)
      expect(json.data[0]).toEqual({ handle: 'blog-tags', title: 'Blog Tags' })
      expect(json.data[1]).toEqual({ handle: 'categories', title: 'Categories', blueprint: 'categories' })
    })

    it('returns 500 on filesystem error', async () => {
      vi.mocked(loader.loadAll).mockRejectedValue(new Error('EACCES: permission denied'))

      const req = makeRequest('GET')
      const res = await handlers.handleListDefinitions(req, 'taxonomies')
      const json = await res.json()

      expect(res.status).toBe(500)
      expect(json.error).toContain('EACCES')
    })
  })

  describe('handleGetDefinition', () => {
    it('returns 422 for invalid entity type', async () => {
      const req = makeRequest('GET')
      const res = await handlers.handleGetDefinition(req, 'widgets', 'foo')
      const json = await res.json()

      expect(res.status).toBe(422)
      expect(json.error).toContain('Invalid entity type')
    })

    it('returns 200 with definition data', async () => {
      vi.mocked(loader.load).mockResolvedValue({ title: 'Blog Tags', blueprint: 'tags' })

      const req = makeRequest('GET')
      const res = await handlers.handleGetDefinition(req, 'taxonomies', 'blog-tags')
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.data).toEqual({ handle: 'blog-tags', title: 'Blog Tags', blueprint: 'tags' })
    })

    it('returns 404 when definition not found', async () => {
      vi.mocked(loader.load).mockRejectedValue(
        new DefinitionNotFoundError('taxonomies', 'nonexistent')
      )

      const req = makeRequest('GET')
      const res = await handlers.handleGetDefinition(req, 'taxonomies', 'nonexistent')
      const json = await res.json()

      expect(res.status).toBe(404)
      expect(json.error).toContain('not found')
    })

    it('returns 500 on unexpected error', async () => {
      vi.mocked(loader.load).mockRejectedValue(new Error('Disk failure'))

      const req = makeRequest('GET')
      const res = await handlers.handleGetDefinition(req, 'taxonomies', 'blog-tags')
      const json = await res.json()

      expect(res.status).toBe(500)
      expect(json.error).toContain('Disk failure')
    })
  })

  describe('handleCreateDefinition', () => {
    it('returns 422 for invalid entity type', async () => {
      const req = makeRequest('POST', { handle: 'test', title: 'Test' })
      const res = await handlers.handleCreateDefinition(req, 'invalid')
      const json = await res.json()

      expect(res.status).toBe(422)
      expect(json.error).toContain('Invalid entity type')
    })

    it('returns 422 when handle is missing', async () => {
      const req = makeRequest('POST', { title: 'Test' })
      const res = await handlers.handleCreateDefinition(req, 'taxonomies')
      const json = await res.json()

      expect(res.status).toBe(422)
      expect(json.details.handle).toBeDefined()
    })

    it('returns 422 with field-level errors on schema validation failure', async () => {
      const req = makeRequest('POST', { handle: 'test', title: 123 })
      const res = await handlers.handleCreateDefinition(req, 'taxonomies')
      const json = await res.json()

      expect(res.status).toBe(422)
      expect(json.error).toBe('Validation failed')
      expect(json.details.title).toBeDefined()
      expect(Array.isArray(json.details.title)).toBe(true)
    })

    it('returns 422 when required title field is missing', async () => {
      const req = makeRequest('POST', { handle: 'test', blueprint: 'tags' })
      const res = await handlers.handleCreateDefinition(req, 'taxonomies')
      const json = await res.json()

      expect(res.status).toBe(422)
      expect(json.details.title).toBeDefined()
    })

    it('returns 201 with created definition on success', async () => {
      vi.mocked(loader.create).mockResolvedValue(undefined)

      const req = makeRequest('POST', { handle: 'blog-tags', title: 'Blog Tags' })
      const res = await handlers.handleCreateDefinition(req, 'taxonomies')
      const json = await res.json()

      expect(res.status).toBe(201)
      expect(json.data).toEqual({ handle: 'blog-tags', title: 'Blog Tags' })
      expect(loader.create).toHaveBeenCalledWith('taxonomies', 'blog-tags', { title: 'Blog Tags' })
    })

    it('returns 201 for navigation with optional fields', async () => {
      vi.mocked(loader.create).mockResolvedValue(undefined)

      const req = makeRequest('POST', {
        handle: 'main-nav',
        title: 'Main Navigation',
        max_depth: 3,
        collections: ['blog', 'pages'],
      })
      const res = await handlers.handleCreateDefinition(req, 'navigations')
      const json = await res.json()

      expect(res.status).toBe(201)
      expect(json.data.handle).toBe('main-nav')
      expect(json.data.title).toBe('Main Navigation')
      expect(json.data.max_depth).toBe(3)
      expect(json.data.collections).toEqual(['blog', 'pages'])
    })

    it('returns 500 on filesystem error during create', async () => {
      vi.mocked(loader.create).mockRejectedValue(new Error('ENOSPC: no space left'))

      const req = makeRequest('POST', { handle: 'test', title: 'Test' })
      const res = await handlers.handleCreateDefinition(req, 'taxonomies')
      const json = await res.json()

      expect(res.status).toBe(500)
      expect(json.error).toContain('ENOSPC')
    })
  })

  describe('handleUpdateDefinition', () => {
    it('returns 422 for invalid entity type', async () => {
      const req = makeRequest('PUT', { title: 'Updated' })
      const res = await handlers.handleUpdateDefinition(req, 'invalid', 'test')
      const json = await res.json()

      expect(res.status).toBe(422)
      expect(json.error).toContain('Invalid entity type')
    })

    it('returns 422 with field-level errors on validation failure', async () => {
      const req = makeRequest('PUT', { title: 123 })
      const res = await handlers.handleUpdateDefinition(req, 'taxonomies', 'test')
      const json = await res.json()

      expect(res.status).toBe(422)
      expect(json.error).toBe('Validation failed')
      expect(json.details.title).toBeDefined()
    })

    it('returns 200 with updated definition on success', async () => {
      vi.mocked(loader.update).mockResolvedValue(undefined)

      const req = makeRequest('PUT', { title: 'Updated Tags' })
      const res = await handlers.handleUpdateDefinition(req, 'taxonomies', 'blog-tags')
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.data).toEqual({ handle: 'blog-tags', title: 'Updated Tags' })
      expect(loader.update).toHaveBeenCalledWith('taxonomies', 'blog-tags', { title: 'Updated Tags' })
    })

    it('returns 404 when definition not found', async () => {
      vi.mocked(loader.update).mockRejectedValue(
        new DefinitionNotFoundError('taxonomies', 'nonexistent')
      )

      const req = makeRequest('PUT', { title: 'Updated' })
      const res = await handlers.handleUpdateDefinition(req, 'taxonomies', 'nonexistent')
      const json = await res.json()

      expect(res.status).toBe(404)
      expect(json.error).toContain('not found')
    })

    it('returns 500 on filesystem error', async () => {
      vi.mocked(loader.update).mockRejectedValue(new Error('EROFS: read-only filesystem'))

      const req = makeRequest('PUT', { title: 'Updated' })
      const res = await handlers.handleUpdateDefinition(req, 'taxonomies', 'test')
      const json = await res.json()

      expect(res.status).toBe(500)
      expect(json.error).toContain('EROFS')
    })
  })

  describe('handleDeleteDefinition', () => {
    it('returns 422 for invalid entity type', async () => {
      const req = makeRequest('DELETE')
      const res = await handlers.handleDeleteDefinition(req, 'invalid', 'test')
      const json = await res.json()

      expect(res.status).toBe(422)
      expect(json.error).toContain('Invalid entity type')
    })

    it('returns 204 on successful delete', async () => {
      vi.mocked(loader.delete).mockResolvedValue(undefined)

      const req = makeRequest('DELETE')
      const res = await handlers.handleDeleteDefinition(req, 'taxonomies', 'blog-tags')

      expect(res.status).toBe(204)
      expect(res.body).toBeNull()
      expect(loader.delete).toHaveBeenCalledWith('taxonomies', 'blog-tags')
    })

    it('returns 404 when definition not found', async () => {
      vi.mocked(loader.delete).mockRejectedValue(
        new DefinitionNotFoundError('taxonomies', 'nonexistent')
      )

      const req = makeRequest('DELETE')
      const res = await handlers.handleDeleteDefinition(req, 'taxonomies', 'nonexistent')
      const json = await res.json()

      expect(res.status).toBe(404)
      expect(json.error).toContain('not found')
    })

    it('returns 500 on filesystem error', async () => {
      vi.mocked(loader.delete).mockRejectedValue(new Error('EPERM: operation not permitted'))

      const req = makeRequest('DELETE')
      const res = await handlers.handleDeleteDefinition(req, 'taxonomies', 'test')
      const json = await res.json()

      expect(res.status).toBe(500)
      expect(json.error).toContain('EPERM')
    })
  })

  describe('form definitions validation', () => {
    it('returns 422 when honeypot is not boolean', async () => {
      const req = makeRequest('POST', { handle: 'contact', title: 'Contact', honeypot: 'yes' })
      const res = await handlers.handleCreateDefinition(req, 'forms')
      const json = await res.json()

      expect(res.status).toBe(422)
      expect(json.details.honeypot).toBeDefined()
    })

    it('accepts valid form definition with all optional fields', async () => {
      vi.mocked(loader.create).mockResolvedValue(undefined)

      const req = makeRequest('POST', {
        handle: 'contact',
        title: 'Contact Form',
        blueprint: 'contact',
        honeypot: true,
        store_submissions: false,
      })
      const res = await handlers.handleCreateDefinition(req, 'forms')
      const json = await res.json()

      expect(res.status).toBe(201)
      expect(json.data.title).toBe('Contact Form')
      expect(json.data.honeypot).toBe(true)
      expect(json.data.store_submissions).toBe(false)
    })
  })
})
