// Property 13: Migration non-destructive

import { describe, it, expect, afterEach } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { migrateDefinitions } from '../../../packages/madori-cli/src/commands/migrate-definitions'

/**
 * Validates: Requirements 10.4
 *
 * Property: For any target path where a definition file already exists before
 * migration, the migration SHALL not modify or overwrite that file — the file
 * content after migration SHALL be identical to the content before migration.
 */

// --- Generators ---

/** Arbitrary valid handle: lowercase letter followed by alphanumeric/hyphens */
const handleArb = fc
  .stringMatching(/^[a-z][a-z0-9-]{0,15}$/)
  .filter((s) => s.length > 0)

/** Arbitrary non-empty title */
const titleArb = fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0)

/** Generate a taxonomy definition with handle and title */
const taxonomyDefArb = fc.record({
  handle: handleArb,
  title: titleArb,
})

/**
 * Generate N unique taxonomy definitions (1-10), then pick K (1 to N) to pre-create.
 * Returns { allDefs, preExistingIndices }
 */
const migrationScenarioArb = fc
  .array(taxonomyDefArb, { minLength: 1, maxLength: 10 })
  .filter((defs) => {
    // Ensure all handles are unique
    const handles = defs.map((d) => d.handle)
    return new Set(handles).size === handles.length
  })
  .chain((allDefs) => {
    const n = allDefs.length
    // Pick K indices (1 to N) to pre-create
    return fc
      .subarray(
        Array.from({ length: n }, (_, i) => i),
        { minLength: 1, maxLength: n },
      )
      .map((preExistingIndices) => ({ allDefs, preExistingIndices }))
  })

// --- Test State ---

const tmpDirs: string[] = []

afterEach(async () => {
  for (const dir of tmpDirs) {
    await fs.rm(dir, { recursive: true, force: true })
  }
  tmpDirs.length = 0
})

// --- Property Tests ---

describe('Property 13: Migration non-destructive', () => {
  it('pre-existing definition files are not modified or overwritten by migration', async () => {
    await fc.assert(
      fc.asyncProperty(migrationScenarioArb, async ({ allDefs, preExistingIndices }) => {
        // Create temp directories
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-migrate-nd-'))
        tmpDirs.push(tmpDir)

        const resourcesPath = path.join(tmpDir, 'resources')
        const taxonomiesDir = path.join(resourcesPath, 'taxonomies')
        await fs.mkdir(taxonomiesDir, { recursive: true })

        // Pre-create K definition files with distinct "ORIGINAL" content
        const preExistingHandles = new Set<string>()
        const originalContents: Record<string, string> = {}

        for (const idx of preExistingIndices) {
          const def = allDefs[idx]
          preExistingHandles.add(def.handle)
          const filePath = path.join(taxonomiesDir, `${def.handle}.yaml`)
          const content = `title: "ORIGINAL: ${def.title}"\n`
          originalContents[def.handle] = content
          await fs.writeFile(filePath, content, 'utf-8')
        }

        // Write a config file exporting all N definitions
        const configPath = path.join(tmpDir, 'config.mjs')
        const configContent = `export default ${JSON.stringify({
          taxonomies: allDefs,
          globals: [],
          navigations: [],
        }, null, 2)};\n`
        await fs.writeFile(configPath, configContent, 'utf-8')

        // Run migration
        const result = await migrateDefinitions(configPath, resourcesPath)

        const k = preExistingIndices.length
        const n = allDefs.length

        // Assert correct counts
        expect(result.skipped.length).toBe(k)
        expect(result.created.length).toBe(n - k)

        // Assert pre-existing files are UNCHANGED
        for (const handle of preExistingHandles) {
          const filePath = path.join(taxonomiesDir, `${handle}.yaml`)
          const contentAfter = await fs.readFile(filePath, 'utf-8')
          expect(contentAfter).toBe(originalContents[handle])
        }
      }),
      { numRuns: 30 },
    )
  })
})
