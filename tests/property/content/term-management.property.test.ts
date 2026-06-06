// Property 8: Term creation persistence round-trip
// Property 9: Unique slug enforcement within a taxonomy

import { describe, it, expect, afterEach } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { NextRequest } from 'next/server'
import { ContentStore } from '@/lib/content/store'
import { createContentHandlers } from '@/app/(cp)/api/handlers/content'

/**
 * Validates: Requirements 5.2, 5.4
 *
 * Property 8: For any valid term data (non-empty slug, title, and arbitrary
 * custom field values matching the taxonomy blueprint), creating the term via
 * the API and reading the resulting YAML file SHALL produce data containing
 * the same slug, title, and custom field values.
 *
 * Property 9: For any taxonomy and any slug string, if a term with that slug
 * already exists in the taxonomy, creating another term with the same slug
 * SHALL be rejected with a validation error. The original term SHALL remain
 * unmodified.
 */

// --- Generators ---

/** Arbitrary valid taxonomy handle: lowercase letter followed by alphanumeric/hyphens */
const taxonomyHandleArb = fc
  .stringMatching(/^[a-z][a-z0-9-]{0,12}$/)
  .filter((s) => s.length > 0)

/** Arbitrary valid term slug: lowercase letter followed by alphanumeric/hyphens */
const termSlugArb = fc
  .stringMatching(/^[a-z][a-z0-9-]{0,12}$/)
  .filter((s) => s.length > 0)

/** Arbitrary non-empty title string */
const titleArb = fc
  .string({ minLength: 1, maxLength: 60 })
  .filter((s) => s.trim().length > 0)

/** Arbitrary custom field values (simple key-value pairs with string values) */
const customFieldsArb = fc
  .dictionary(
    fc.stringMatching(/^[a-z][a-z0-9_]{0,10}$/).filter((s) => s.length > 0 && s !== 'title' && s !== 'slug'),
    fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
    { minKeys: 0, maxKeys: 4 }
  )

/** Full term data: title + optional custom fields */
const termDataArb = fc.tuple(titleArb, customFieldsArb).map(([title, fields]) => ({
  title,
  ...fields,
}))

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

describe('Property 8: Term creation persistence round-trip', () => {
  /**
   * Validates: Requirements 5.2
   *
   * Generate valid term data, assert create/read round-trip preserves slug, title, custom fields
   */
  it('creating a term then reading it back preserves slug, title, and custom fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        taxonomyHandleArb,
        termSlugArb,
        termDataArb,
        async (taxonomyHandle, termSlug, termData) => {
          // Setup temp directory and handlers
          const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-term-roundtrip-'))
          tmpDirs.push(tmpDir)

          const contentStore = new ContentStore(tmpDir)
          const handlers = createContentHandlers(contentStore)

          // CREATE: POST term with slug, title, and custom fields
          const createReq = makeRequest('POST', { slug: termSlug, ...termData })
          const createRes = await handlers.handleCreateContent(createReq, 'taxonomies', taxonomyHandle)
          expect(createRes.status).toBe(201)

          const createBody = await createRes.json()
          expect(createBody.data.id).toBe(termSlug)

          // READ: GET term by slug
          const getReq = makeRequest('GET')
          const getRes = await handlers.handleGetContent(getReq, 'taxonomies', taxonomyHandle, termSlug)
          expect(getRes.status).toBe(200)

          const getBody = await getRes.json()

          // Assert slug is preserved
          expect(getBody.data.id).toBe(termSlug)

          // Assert title and all custom field values are preserved
          for (const [key, value] of Object.entries(termData)) {
            expect(getBody.data[key]).toEqual(value)
          }
        },
      ),
      { numRuns: 30 },
    )
  })
})

describe('Property 9: Unique slug enforcement within a taxonomy', () => {
  /**
   * Validates: Requirements 5.4
   *
   * Generate duplicate slug scenarios, assert rejection and original term unchanged
   */
  it('creating a term with a duplicate slug is rejected and the original term remains unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        taxonomyHandleArb,
        termSlugArb,
        termDataArb,
        termDataArb,
        async (taxonomyHandle, termSlug, originalData, duplicateData) => {
          // Setup temp directory and handlers
          const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-term-unique-'))
          tmpDirs.push(tmpDir)

          const contentStore = new ContentStore(tmpDir)
          const handlers = createContentHandlers(contentStore)

          // CREATE the original term
          const createReq = makeRequest('POST', { slug: termSlug, ...originalData })
          const createRes = await handlers.handleCreateContent(createReq, 'taxonomies', taxonomyHandle)
          expect(createRes.status).toBe(201)

          // ATTEMPT to create a second term with the same slug
          const duplicateReq = makeRequest('POST', { slug: termSlug, ...duplicateData })
          const duplicateRes = await handlers.handleCreateContent(duplicateReq, 'taxonomies', taxonomyHandle)

          // Assert rejection with 422 CONFLICT
          expect(duplicateRes.status).toBe(422)
          const duplicateBody = await duplicateRes.json()
          expect(duplicateBody.error.code).toBe('CONFLICT')
          expect(duplicateBody.error.message).toBe('A term with this slug already exists')

          // READ the original term and verify it is unchanged
          const getReq = makeRequest('GET')
          const getRes = await handlers.handleGetContent(getReq, 'taxonomies', taxonomyHandle, termSlug)
          expect(getRes.status).toBe(200)

          const getBody = await getRes.json()
          expect(getBody.data.id).toBe(termSlug)

          // Assert original data is preserved (not overwritten by duplicate attempt)
          for (const [key, value] of Object.entries(originalData)) {
            expect(getBody.data[key]).toEqual(value)
          }
        },
      ),
      { numRuns: 30 },
    )
  })
})
