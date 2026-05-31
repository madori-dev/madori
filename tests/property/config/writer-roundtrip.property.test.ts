// Property 2: Config write/read round-trip preserves data

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { FileConfigWriter } from '@/lib/config/writer'
import type { CollectionConfig } from '@/lib/config/schema'

/**
 * Validates: Requirements 2.3, 13.1, 13.3
 *
 * Property: For any valid CollectionConfig object and any existing madori.config.ts
 * content containing that collection handle, writing the config via
 * ConfigWriter.writeCollectionConfig and then reading it back via
 * ConfigWriter.readCollectionConfig produces an object deeply equal to the original.
 */

// --- Generators ---

/** Arbitrary non-empty alphanumeric string safe for use in TS identifiers and file parsing */
const safeStringArb = fc
  .stringMatching(/^[a-zA-Z][a-zA-Z0-9 _-]{0,30}$/)
  .filter((s) => s.trim().length > 0)

/** Arbitrary handle (valid JS identifier) */
const handleArb = fc.stringMatching(/^[a-z][a-z0-9_]{1,15}$/)

/** Arbitrary optional safe string field */
const optionalStringArb = fc.option(safeStringArb, { nil: undefined })

/** Arbitrary optional boolean field */
const optionalBooleanArb = fc.option(fc.boolean(), { nil: undefined })

/** Arbitrary optional sortDirection */
const optionalSortDirectionArb = fc.option(
  fc.constantFrom('asc' as const, 'desc' as const),
  { nil: undefined },
)

/** Arbitrary optional defaultStatus */
const optionalDefaultStatusArb = fc.option(
  fc.constantFrom('published' as const, 'draft' as const),
  { nil: undefined },
)

/** Arbitrary optional taxonomies array */
const optionalTaxonomiesArb = fc.option(
  fc.array(safeStringArb, { maxLength: 3 }),
  { nil: undefined },
)

/** Arbitrary optional blueprints array */
const optionalBlueprintsArb = fc.option(
  fc.array(safeStringArb, { maxLength: 3 }),
  { nil: undefined },
)

/** Arbitrary optional redirects object */
const optionalRedirectsArb = fc.option(
  fc.record({
    create: optionalStringArb,
    '404': optionalStringArb,
  }),
  { nil: undefined },
)

/** Generator for valid CollectionConfig objects with a fixed handle */
function validCollectionConfigArb(handle: string): fc.Arbitrary<CollectionConfig> {
  return fc.record({
    title: safeStringArb,
    handle: fc.constant(handle),
    blueprint: safeStringArb,
    route: optionalStringArb,
    sortable: optionalBooleanArb,
    dated: optionalBooleanArb,
    defaultStatus: optionalDefaultStatusArb,
    icon: optionalStringArb,
    sortDirection: optionalSortDirectionArb,
    template: optionalStringArb,
    layout: optionalStringArb,
    taxonomies: optionalTaxonomiesArb,
    redirects: optionalRedirectsArb,
    blueprints: optionalBlueprintsArb,
  })
}

// --- Helpers ---

/**
 * Creates a minimal madori.config.ts file content containing a single collection.
 * Uses a simple JS module.exports format that can be dynamically imported.
 */
function createConfigFileContent(handle: string, config: CollectionConfig): string {
  const serializedConfig = JSON.stringify(config, null, 2)
    .replace(/"([^"]+)":/g, '$1:') // Remove quotes from keys
    .replace(/"/g, "'") // Use single quotes for string values

  return `const config = {
  collections: {
    ${handle}: ${serializedConfig},
  },
}

export default config
`
}

// --- Test Setup ---

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-writer-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// --- Property Tests ---

describe('Property 2: Config write/read round-trip preserves data', () => {
  it('writing then reading a collection config produces the original object', async () => {
    const testHandle = 'testcol'

    await fc.assert(
      fc.asyncProperty(validCollectionConfigArb(testHandle), async (config) => {
        // Remove undefined keys to match serialization behavior
        const cleaned = JSON.parse(JSON.stringify(config)) as CollectionConfig

        // Create a temp config file with an initial placeholder collection
        const configFilePath = path.join(tmpDir, `config-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`)
        const initialConfig: CollectionConfig = {
          title: 'Placeholder',
          handle: testHandle,
          blueprint: 'default',
        }
        const initialContent = createConfigFileContent(testHandle, initialConfig)
        await fs.writeFile(configFilePath, initialContent, 'utf-8')

        // Write the generated config
        const writer = new FileConfigWriter(configFilePath)
        await writer.writeCollectionConfig(testHandle, cleaned)

        // Read it back
        const readBack = await writer.readCollectionConfig(testHandle)

        // Assert deep equality
        expect(readBack).toEqual(cleaned)
      }),
      { numRuns: 50 },
    )
  })
})
