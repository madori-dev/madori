// Property 3: Definition discovery completeness

import { describe, it, expect, afterEach } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { DefinitionLoader } from '@/lib/definitions/loader'

/**
 * Validates: Requirements 1.1, 1.3
 *
 * Property: For any set of valid definition files placed in a
 * resources/{entityType}/ directory, the DefinitionLoader SHALL discover
 * and return exactly that set, indexed by handle with no missing or extra entries.
 */

// --- Generators ---

/** Arbitrary valid handle: lowercase letter followed by alphanumeric/hyphens */
const handleArb = fc
  .stringMatching(/^[a-z][a-z0-9-]{0,20}$/)
  .filter((s) => s.length > 0)

/** Arbitrary supported file extension */
const extensionArb = fc.constantFrom('.yaml', '.yml', '.json')

/** Generate a unique set of N handles with random extensions */
const definitionSetArb = fc
  .integer({ min: 1, max: 20 })
  .chain((n) =>
    fc.tuple(
      fc.uniqueArray(handleArb, { minLength: n, maxLength: n }),
      fc.array(extensionArb, { minLength: n, maxLength: n }),
    ),
  )

// --- Helpers ---

function serializeDefinition(ext: string, title: string): string {
  if (ext === '.json') {
    return JSON.stringify({ title }, null, 2) + '\n'
  }
  return `title: "${title}"\n`
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

describe('Property 3: Definition discovery completeness', () => {
  it('discover returns exactly N entries indexed by handle for N definition files', () => {
    fc.assert(
      fc.asyncProperty(definitionSetArb, async ([handles, extensions]) => {
        // Create a temp directory structure: {tmpDir}/taxonomies/
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-test-'))
        tmpDirs.push(tmpDir)

        const entityDir = path.join(tmpDir, 'taxonomies')
        await fs.mkdir(entityDir, { recursive: true })

        // Write definition files
        for (let i = 0; i < handles.length; i++) {
          const filename = `${handles[i]}${extensions[i]}`
          const content = serializeDefinition(extensions[i], `Title ${handles[i]}`)
          await fs.writeFile(path.join(entityDir, filename), content, 'utf-8')
        }

        // Discover definitions
        const loader = new DefinitionLoader(tmpDir)
        const result = await loader.discover('taxonomies')

        // Assert exactly N entries
        expect(result.size).toBe(handles.length)

        // Assert each handle is present in the result map
        for (const handle of handles) {
          expect(result.has(handle)).toBe(true)
          const entry = result.get(handle)!
          expect(entry.handle).toBe(handle)
        }
      }),
      { numRuns: 50 },
    )
  })
})
