// Property 12: Migration completeness

import { describe, it, expect, afterEach } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { migrateDefinitions } from '../../../packages/madori-cli/src/commands/migrate-definitions'
import { UniversalFileParser } from '@/lib/fs/parser'

/**
 * Validates: Requirements 10.2
 *
 * Property: For any config object containing taxonomies, globals, or navigations
 * properties with N entities defined, running the migration SHALL produce exactly
 * N definition files (minus any that already exist), and each produced file SHALL
 * parse back to an equivalent definition.
 */

// --- Generators ---

/** Valid handle: lowercase letters and hyphens, must start with a letter */
const handleArb = fc
  .stringMatching(/^[a-z][a-z0-9-]{0,15}$/)
  .filter((s) => s.length >= 2)

/** Non-empty title string */
const titleArb = fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0)

/** Generate a taxonomy definition with handle */
const taxonomyDefArb = fc.record({
  handle: handleArb,
  title: titleArb,
})

/** Generate a global definition with handle */
const globalDefArb = fc.record({
  handle: handleArb,
  title: titleArb,
})

/** Generate a navigation definition with handle */
const navigationDefArb = fc.record({
  handle: handleArb,
  title: titleArb,
})

/** Generate a config with N taxonomies, M globals, P navigations (unique handles per type) */
const configArb = fc.record({
  taxonomies: fc.array(taxonomyDefArb, { minLength: 1, maxLength: 10 })
    .map((items) => dedupeByHandle(items)),
  globals: fc.array(globalDefArb, { minLength: 0, maxLength: 5 })
    .map((items) => dedupeByHandle(items)),
  navigations: fc.array(navigationDefArb, { minLength: 0, maxLength: 5 })
    .map((items) => dedupeByHandle(items)),
})

/** Deduplicate array items by handle property */
function dedupeByHandle<T extends { handle: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.handle)) return false
    seen.add(item.handle)
    return true
  })
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

/**
 * Write a JavaScript config file that exports the given config object.
 * We use .mjs so dynamic import() works without TypeScript compilation.
 */
async function writeConfigFile(
  dir: string,
  config: { taxonomies: Array<{ handle: string; title: string }>; globals: Array<{ handle: string; title: string }>; navigations: Array<{ handle: string; title: string }> },
): Promise<string> {
  const configPath = path.join(dir, 'madori.config.mjs')
  const content = `export default ${JSON.stringify(config, null, 2)};\n`
  await fs.writeFile(configPath, content, 'utf-8')
  return configPath
}

// --- Property Tests ---

describe('Property 12: Migration completeness', () => {
  it('generates N definition files for N entities, each parsing back to equivalent definition', async () => {
    await fc.assert(
      fc.asyncProperty(configArb, async (config) => {
        // Create temp directories
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-migrate-'))
        tmpDirs.push(tmpDir)

        const resourcesPath = path.join(tmpDir, 'resources')
        await fs.mkdir(resourcesPath, { recursive: true })

        // Write config file
        const configPath = await writeConfigFile(tmpDir, config)

        // Run migration
        const result = await migrateDefinitions(configPath, resourcesPath)

        // Calculate expected total
        const totalExpected = config.taxonomies.length + config.globals.length + config.navigations.length

        // Assert correct number of files created
        expect(result.created.length).toBe(totalExpected)

        // For each created file, verify it parses back to equivalent definition
        const parser = new UniversalFileParser()

        for (const entityType of ['taxonomies', 'globals', 'navigations'] as const) {
          for (const def of config[entityType]) {
            const filePath = path.join(resourcesPath, entityType, `${def.handle}.yaml`)

            // File must exist
            const content = await fs.readFile(filePath, 'utf-8')
            const parsed = parser.parse<Record<string, unknown>>(filePath, content)

            // Parsed object should have matching title
            expect(parsed.title).toBe(def.title)

            // Handle should NOT be in the file (it's derived from filename)
            expect(parsed).not.toHaveProperty('handle')
          }
        }
      }),
      { numRuns: 30 },
    )
  })
})
