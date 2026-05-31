// Property 10: API definition CRUD round-trip

import { describe, it, expect, afterEach } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { NextRequest } from 'next/server'
import { createDefinitionHandlers } from '@/app/(cp)/api/handlers/definitions'
import { DefinitionLoader } from '@/lib/definitions/loader'
import type { EntityType } from '@/lib/definitions/errors'

/**
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5
 *
 * Property: For any valid definition data and entity type, creating via POST
 * then reading via GET SHALL return an object equivalent to the input data;
 * updating via PUT then reading via GET SHALL return the updated data;
 * deleting via DELETE then reading via GET SHALL return 404.
 */

// --- Generators ---

/** Arbitrary valid handle: lowercase letter followed by alphanumeric/hyphens */
const handleArb = fc
  .stringMatching(/^[a-z][a-z0-9-]{0,20}$/)
  .filter((s) => s.length > 0)

/** Arbitrary entity type */
const entityTypeArb = fc.constantFrom<EntityType>(
  'taxonomies',
  'globals',
  'navigations',
  'forms',
)

/** Generate valid definition data matching the given entity type */
function definitionDataArb(entityType: EntityType): fc.Arbitrary<Record<string, unknown>> {
  const titleArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0)
  const blueprintArb = fc.option(
    fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
    { nil: undefined },
  )

  switch (entityType) {
    case 'taxonomies':
    case 'globals':
      return fc.record({
        title: titleArb,
        blueprint: blueprintArb,
      }).map((r) => {
        const obj: Record<string, unknown> = { title: r.title }
        if (r.blueprint !== undefined) obj.blueprint = r.blueprint
        return obj
      })

    case 'navigations':
      return fc.record({
        title: titleArb,
        max_depth: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
        collections: fc.option(
          fc.array(
            fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
            { minLength: 0, maxLength: 5 },
          ),
          { nil: undefined },
        ),
      }).map((r) => {
        const obj: Record<string, unknown> = { title: r.title }
        if (r.max_depth !== undefined) obj.max_depth = r.max_depth
        if (r.collections !== undefined) obj.collections = r.collections
        return obj
      })

    case 'forms':
      return fc.record({
        title: titleArb,
        blueprint: blueprintArb,
        honeypot: fc.option(fc.boolean(), { nil: undefined }),
        store_submissions: fc.option(fc.boolean(), { nil: undefined }),
      }).map((r) => {
        const obj: Record<string, unknown> = { title: r.title }
        if (r.blueprint !== undefined) obj.blueprint = r.blueprint
        if (r.honeypot !== undefined) obj.honeypot = r.honeypot
        if (r.store_submissions !== undefined) obj.store_submissions = r.store_submissions
        return obj
      })
  }
}

/** Generate a second (updated) definition that differs from the first */
function updatedDataArb(entityType: EntityType): fc.Arbitrary<Record<string, unknown>> {
  return definitionDataArb(entityType)
}

// --- Test State ---

const tmpDirs: string[] = []

afterEach(async () => {
  for (const dir of tmpDirs) {
    await fs.rm(dir, { recursive: true, force: true })
  }
  tmpDirs.length = 0
})

// --- Helpers ---

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  const init: RequestInit = { method }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  return new NextRequest(new URL(url, 'http://localhost:3000'), init)
}

// --- Property Tests ---

describe('Property 10: API definition CRUD round-trip', () => {
  it('POST → GET asserts equivalence, PUT → GET asserts update, DELETE → GET asserts 404', async () => {
    await fc.assert(
      fc.asyncProperty(
        entityTypeArb.chain((entityType) =>
          fc.tuple(
            fc.constant(entityType),
            handleArb,
            definitionDataArb(entityType),
            updatedDataArb(entityType),
          ),
        ),
        async ([entityType, handle, createData, updateData]) => {
          // Create a temp directory for this test run
          const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-api-def-'))
          tmpDirs.push(tmpDir)

          const loader = new DefinitionLoader(tmpDir)
          const handlers = createDefinitionHandlers(loader)

          // --- POST: Create definition ---
          const createBody = { handle, ...createData }
          const createReq = makeRequest('POST', `/api/definitions/${entityType}`, createBody)
          const createRes = await handlers.handleCreateDefinition(createReq, entityType)

          expect(createRes.status).toBe(201)
          const createJson = await createRes.json()
          expect(createJson.data).toEqual({ handle, ...createData })

          // --- GET: Read back created definition ---
          const getReq = makeRequest('GET', `/api/definitions/${entityType}/${handle}`)
          const getRes = await handlers.handleGetDefinition(getReq, entityType, handle)

          expect(getRes.status).toBe(200)
          const getJson = await getRes.json()
          expect(getJson.data).toEqual({ handle, ...createData })

          // --- PUT: Update definition ---
          const updateReq = makeRequest('PUT', `/api/definitions/${entityType}/${handle}`, updateData)
          const updateRes = await handlers.handleUpdateDefinition(updateReq, entityType, handle)

          expect(updateRes.status).toBe(200)
          const updateJson = await updateRes.json()
          expect(updateJson.data).toEqual({ handle, ...updateData })

          // --- GET: Read back updated definition ---
          const getUpdatedReq = makeRequest('GET', `/api/definitions/${entityType}/${handle}`)
          const getUpdatedRes = await handlers.handleGetDefinition(getUpdatedReq, entityType, handle)

          expect(getUpdatedRes.status).toBe(200)
          const getUpdatedJson = await getUpdatedRes.json()
          expect(getUpdatedJson.data).toEqual({ handle, ...updateData })

          // --- DELETE: Remove definition ---
          const deleteReq = makeRequest('DELETE', `/api/definitions/${entityType}/${handle}`)
          const deleteRes = await handlers.handleDeleteDefinition(deleteReq, entityType, handle)

          expect(deleteRes.status).toBe(204)

          // --- GET: Verify 404 after deletion ---
          const getDeletedReq = makeRequest('GET', `/api/definitions/${entityType}/${handle}`)
          const getDeletedRes = await handlers.handleGetDefinition(getDeletedReq, entityType, handle)

          expect(getDeletedRes.status).toBe(404)
        },
      ),
      { numRuns: 30 },
    )
  })
})
