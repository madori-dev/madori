// Property 5: Missing content graceful fallback

import { describe, it, expect, afterEach } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { ContentStore } from '@/lib/content/store'

/**
 * Validates: Requirements 2.5
 *
 * Property: For any entity handle that has no corresponding content directory
 * or file, the ContentStore SHALL return an empty collection (empty array or
 * empty object) without throwing an error.
 */

// --- Generators ---

/** Arbitrary valid handle: lowercase letter followed by alphanumeric/hyphens */
const handleArb = fc
  .stringMatching(/^[a-z][a-z0-9-]{0,20}$/)
  .filter((s) => s.length > 0)

/** Arbitrary slug for getTerm/getSubmission lookups */
const slugArb = fc
  .stringMatching(/^[a-z][a-z0-9-]{0,20}$/)
  .filter((s) => s.length > 0)

// --- Test State ---

const tmpDirs: string[] = []

afterEach(async () => {
  for (const dir of tmpDirs) {
    await fs.rm(dir, { recursive: true, force: true })
  }
  tmpDirs.length = 0
})

// --- Property Tests ---

describe('Property 5: Missing content graceful fallback', () => {
  it('listTerms returns empty array for any handle with no content directory', async () => {
    await fc.assert(
      fc.asyncProperty(handleArb, async (handle) => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-test-'))
        tmpDirs.push(tmpDir)

        const store = new ContentStore(tmpDir)
        const result = await store.listTerms(handle)

        expect(result).toEqual([])
      }),
      { numRuns: 100 },
    )
  })

  it('getTerm returns null for any handle and slug with no content file', async () => {
    await fc.assert(
      fc.asyncProperty(handleArb, slugArb, async (handle, slug) => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-test-'))
        tmpDirs.push(tmpDir)

        const store = new ContentStore(tmpDir)
        const result = await store.getTerm(handle, slug)

        expect(result).toBeNull()
      }),
      { numRuns: 100 },
    )
  })

  it('listSubmissions returns empty array for any handle with no content directory', async () => {
    await fc.assert(
      fc.asyncProperty(handleArb, async (handle) => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-test-'))
        tmpDirs.push(tmpDir)

        const store = new ContentStore(tmpDir)
        const result = await store.listSubmissions(handle)

        expect(result).toEqual([])
      }),
      { numRuns: 100 },
    )
  })

  it('getSubmission returns null for any handle and id with no content file', async () => {
    await fc.assert(
      fc.asyncProperty(handleArb, slugArb, async (handle, id) => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-test-'))
        tmpDirs.push(tmpDir)

        const store = new ContentStore(tmpDir)
        const result = await store.getSubmission(handle, id)

        expect(result).toBeNull()
      }),
      { numRuns: 100 },
    )
  })

  it('getGlobal returns empty object for any handle with no content file', async () => {
    await fc.assert(
      fc.asyncProperty(handleArb, async (handle) => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-test-'))
        tmpDirs.push(tmpDir)

        const store = new ContentStore(tmpDir)
        const result = await store.getGlobal(handle)

        expect(result).toEqual({})
      }),
      { numRuns: 100 },
    )
  })

  it('getNavigation returns { items: [] } for any handle with no content file', async () => {
    await fc.assert(
      fc.asyncProperty(handleArb, async (handle) => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-test-'))
        tmpDirs.push(tmpDir)

        const store = new ContentStore(tmpDir)
        const result = await store.getNavigation(handle)

        expect(result).toEqual({ items: [] })
      }),
      { numRuns: 100 },
    )
  })
})
