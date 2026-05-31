// Property 11: API content CRUD round-trip

import { describe, it, expect, afterEach } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { NextRequest } from 'next/server'
import { ContentStore } from '@/lib/content/store'
import { createContentHandlers } from '@/app/(cp)/api/handlers/content'

/**
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5
 *
 * Property: For any valid content entry data, entity type, and handle,
 * creating via POST then reading via GET SHALL return an object containing
 * the input data; updating via PUT then reading via GET SHALL return the
 * updated data; deleting via DELETE then reading via GET SHALL return 404.
 */

// --- Generators ---

/** Arbitrary valid taxonomy handle: lowercase letter followed by alphanumeric/hyphens */
const taxonomyHandleArb = fc
  .stringMatching(/^[a-z][a-z0-9-]{0,15}$/)
  .filter((s) => s.length > 0)

/** Arbitrary valid term slug: lowercase letter followed by alphanumeric/hyphens */
const termSlugArb = fc
  .stringMatching(/^[a-z][a-z0-9-]{0,15}$/)
  .filter((s) => s.length > 0)

/** Arbitrary term data: record with string values (no slug key to avoid conflicts) */
const termDataArb = fc
  .record({
    title: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
    description: fc.option(
      fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
      { nil: undefined },
    ),
  })
  .map((r) => {
    const obj: Record<string, unknown> = { title: r.title }
    if (r.description !== undefined) obj.description = r.description
    return obj
  })

// --- Helpers ---

function makeRequest(method: string, body?: unknown): NextRequest {
  const url = 'http://localhost:3000/api/content/taxonomies'
  const init: RequestInit = { method }
  if (body) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  return new NextRequest(url, init)
}

// --- Test State ---

const tmpDirs: string[] = []

afterEach(async () => {
  for (const dir of tmpDirs) {
    await fs.rm(dir, { recursive: true, force: true })
  }
  tmpDirs.length = 0
})

// --- Property Tests ---

describe('Property 11: API content CRUD round-trip', () => {
  it('POST → GET returns created data, PUT → GET returns updated data, DELETE → GET returns 404', async () => {
    await fc.assert(
      fc.asyncProperty(
        taxonomyHandleArb,
        termSlugArb,
        termDataArb,
        termDataArb,
        async (taxonomyHandle, termSlug, initialData, updatedData) => {
          // Setup temp directory and handlers
          const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-content-crud-'))
          tmpDirs.push(tmpDir)

          const contentStore = new ContentStore(tmpDir)
          const handlers = createContentHandlers(contentStore)

          // --- CREATE: POST → assert 201 ---
          const createReq = makeRequest('POST', { slug: termSlug, ...initialData })
          const createRes = await handlers.handleCreateContent(createReq, 'taxonomies', taxonomyHandle)
          expect(createRes.status).toBe(201)

          const createBody = await createRes.json()
          expect(createBody.data.id).toBe(termSlug)
          // Assert all initial data keys are present in response
          for (const [key, value] of Object.entries(initialData)) {
            expect(createBody.data[key]).toEqual(value)
          }

          // --- READ after CREATE: GET → assert 200 and data matches ---
          const getReq1 = makeRequest('GET')
          const getRes1 = await handlers.handleGetContent(getReq1, 'taxonomies', taxonomyHandle, termSlug)
          expect(getRes1.status).toBe(200)

          const getBody1 = await getRes1.json()
          expect(getBody1.data.id).toBe(termSlug)
          for (const [key, value] of Object.entries(initialData)) {
            expect(getBody1.data[key]).toEqual(value)
          }

          // --- UPDATE: PUT → assert 200 ---
          const updateReq = makeRequest('PUT', updatedData)
          const updateRes = await handlers.handleUpdateContent(updateReq, 'taxonomies', taxonomyHandle, termSlug)
          expect(updateRes.status).toBe(200)

          const updateBody = await updateRes.json()
          expect(updateBody.data.id).toBe(termSlug)
          for (const [key, value] of Object.entries(updatedData)) {
            expect(updateBody.data[key]).toEqual(value)
          }

          // --- READ after UPDATE: GET → assert 200 and data matches updated ---
          const getReq2 = makeRequest('GET')
          const getRes2 = await handlers.handleGetContent(getReq2, 'taxonomies', taxonomyHandle, termSlug)
          expect(getRes2.status).toBe(200)

          const getBody2 = await getRes2.json()
          expect(getBody2.data.id).toBe(termSlug)
          for (const [key, value] of Object.entries(updatedData)) {
            expect(getBody2.data[key]).toEqual(value)
          }

          // --- DELETE: DELETE → assert 204 ---
          const deleteReq = makeRequest('DELETE')
          const deleteRes = await handlers.handleDeleteContent(deleteReq, 'taxonomies', taxonomyHandle, termSlug)
          expect(deleteRes.status).toBe(204)

          // --- READ after DELETE: GET → assert 404 ---
          const getReq3 = makeRequest('GET')
          const getRes3 = await handlers.handleGetContent(getReq3, 'taxonomies', taxonomyHandle, termSlug)
          expect(getRes3.status).toBe(404)
        },
      ),
      { numRuns: 30 },
    )
  })
})
