// Property 4: Content store read completeness

import { describe, it, expect, afterEach } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { ContentStore } from '@/lib/content/store'

/**
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4
 *
 * Property: For any set of content files placed in the appropriate content
 * directory (terms in content/taxonomies/{handle}/, submissions in
 * content/forms/{handle}/), reading all entries for that entity SHALL return
 * exactly one entry per file, with no missing or extra entries.
 */

// --- Generators ---

/** Arbitrary valid slug: lowercase letter followed by alphanumeric/hyphens */
const slugArb = fc
  .stringMatching(/^[a-z][a-z0-9-]{0,20}$/)
  .filter((s) => s.length > 0)

/** Arbitrary taxonomy handle */
const handleArb = fc
  .stringMatching(/^[a-z][a-z0-9-]{0,12}$/)
  .filter((s) => s.length > 0)

/** Generate a unique set of N slugs */
const slugSetArb = fc
  .integer({ min: 1, max: 15 })
  .chain((n) => fc.uniqueArray(slugArb, { minLength: n, maxLength: n }))

// --- Helpers ---

function serializeYaml(data: Record<string, unknown>): string {
  const lines = Object.entries(data).map(([key, value]) => `${key}: "${value}"`)
  return lines.join('\n') + '\n'
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

describe('Property 4: Content store read completeness', () => {
  it('listTerms returns exactly N entries for N taxonomy term files', async () => {
    await fc.assert(
      fc.asyncProperty(handleArb, slugSetArb, async (handle, slugs) => {
        // Create a temp content directory: {tmpDir}/taxonomies/{handle}/
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-content-'))
        tmpDirs.push(tmpDir)

        const termsDir = path.join(tmpDir, 'taxonomies', handle)
        await fs.mkdir(termsDir, { recursive: true })

        // Write term files
        for (const slug of slugs) {
          const content = serializeYaml({ title: `Term ${slug}`, slug })
          await fs.writeFile(path.join(termsDir, `${slug}.yaml`), content, 'utf-8')
        }

        // Read terms via ContentStore
        const store = new ContentStore(tmpDir)
        const entries = await store.listTerms(handle)

        // Assert exactly N entries
        expect(entries.length).toBe(slugs.length)

        // Assert all slugs are present
        const returnedIds = entries.map((e) => e.id)
        for (const slug of slugs) {
          expect(returnedIds).toContain(slug)
        }
      }),
      { numRuns: 50 },
    )
  })

  it('listSubmissions returns exactly N entries for N form submission files', async () => {
    await fc.assert(
      fc.asyncProperty(handleArb, slugSetArb, async (handle, ids) => {
        // Create a temp content directory: {tmpDir}/forms/{handle}/
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-content-'))
        tmpDirs.push(tmpDir)

        const formsDir = path.join(tmpDir, 'forms', handle)
        await fs.mkdir(formsDir, { recursive: true })

        // Write submission files
        for (const id of ids) {
          const content = serializeYaml({ email: `${id}@example.com`, message: `Message from ${id}` })
          await fs.writeFile(path.join(formsDir, `${id}.yaml`), content, 'utf-8')
        }

        // Read submissions via ContentStore
        const store = new ContentStore(tmpDir)
        const entries = await store.listSubmissions(handle)

        // Assert exactly N entries
        expect(entries.length).toBe(ids.length)

        // Assert all IDs are present
        const returnedIds = entries.map((e) => e.id)
        for (const id of ids) {
          expect(returnedIds).toContain(id)
        }
      }),
      { numRuns: 50 },
    )
  })
})
