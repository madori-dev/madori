// Property 3: Update isolation — other collections remain unchanged

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { FileConfigWriter } from '@/lib/config/writer'
import type { CollectionConfig } from '@/lib/config/schema'

/**
 * Validates: Requirements 13.2
 *
 * Property: For any madori.config.ts containing multiple collection entries,
 * when writeCollectionConfig is called for one specific handle, all other
 * collection entries in the file SHALL remain byte-for-byte identical before
 * and after the write.
 */

// --- Generators ---

/** Arbitrary non-empty alphanumeric string for handles/identifiers */
const identifierArb = fc
  .stringMatching(/^[a-z][a-z0-9_]*$/)
  .filter((s) => s.length >= 2 && s.length <= 20)

/** Arbitrary non-empty string for text fields */
const nonEmptyStringArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0)
  .map((s) => s.replace(/[\\`'"\n\r]/g, 'x')) // Avoid characters that break TS serialization

/** Arbitrary optional string field */
const optionalStringArb = fc.option(nonEmptyStringArb, { nil: undefined })

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

/** Generator for a valid CollectionConfig */
const collectionConfigArb: fc.Arbitrary<CollectionConfig> = fc.record({
  title: nonEmptyStringArb,
  handle: identifierArb,
  blueprint: identifierArb,
  route: optionalStringArb,
  sortable: optionalBooleanArb,
  dated: optionalBooleanArb,
  defaultStatus: optionalDefaultStatusArb,
  icon: optionalStringArb,
  sortDirection: optionalSortDirectionArb,
  template: optionalStringArb,
  layout: optionalStringArb,
  taxonomies: fc.option(fc.array(identifierArb, { maxLength: 3 }), { nil: undefined }),
  redirects: fc.option(
    fc.record({
      create: optionalStringArb,
      '404': optionalStringArb,
    }),
    { nil: undefined },
  ),
  blueprints: fc.option(fc.array(identifierArb, { maxLength: 3 }), { nil: undefined }),
})

/**
 * Generator for a set of 2-4 collections with unique handles.
 * Returns a record of handle -> CollectionConfig.
 */
const multiCollectionArb = fc
  .array(identifierArb, { minLength: 3, maxLength: 5 })
  .chain((handles) => {
    // Ensure unique handles
    const uniqueHandles = [...new Set(handles)]
    if (uniqueHandles.length < 3) {
      return fc.constant(null)
    }
    const selectedHandles = uniqueHandles.slice(0, 4)
    return fc
      .tuple(...selectedHandles.map(() => collectionConfigArb))
      .map((configs) => {
        const record: Record<string, CollectionConfig> = {}
        selectedHandles.forEach((h, i) => {
          // Ensure the handle field matches the key
          record[h] = { ...configs[i], handle: h }
        })
        return record
      })
  })
  .filter((r): r is Record<string, CollectionConfig> => r !== null)

// --- Helpers ---

/** Serialize a CollectionConfig to a TS object literal inline */
function serializeConfig(config: CollectionConfig): string {
  const entries: string[] = []
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined) continue
    entries.push(`      ${formatKey(key)}: ${serializeValue(value)},`)
  }
  return `{\n${entries.join('\n')}\n    }`
}

function formatKey(key: string): string {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`
}

function serializeValue(value: unknown): string {
  if (typeof value === 'string') return `'${value.replace(/'/g, "\\'")}'`
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return `[${value.map((v) => serializeValue(v)).join(', ')}]`
  }
  if (typeof value === 'object' && value !== null) {
    const inner = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${formatKey(k)}: ${serializeValue(v)}`)
      .join(', ')
    return `{ ${inner} }`
  }
  return String(value)
}

/** Generate a madori.config.ts file content from a collections record */
function generateConfigFile(collections: Record<string, CollectionConfig>): string {
  const collectionEntries = Object.entries(collections)
    .map(([handle, config]) => `    ${handle}: ${serializeConfig(config)}`)
    .join(',\n')

  return `import type { MadoriConfigInput } from './src/lib/config/schema'

const config: MadoriConfigInput = {
  contentPath: './content',
  resourcesPath: './resources',
  usersPath: './users',
  assetsPath: './public/assets',

  collections: {
${collectionEntries}
  },

  taxonomies: {},
  globals: {},
  navigations: [],
}

export default config
`
}

// --- Test Setup ---

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-isolation-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// --- Property Tests ---

describe('Property 3: Update isolation — other collections remain unchanged', () => {
  it('updating one collection does not modify any other collections', async () => {
    await fc.assert(
      fc.asyncProperty(
        multiCollectionArb,
        collectionConfigArb,
        async (collections, newConfig) => {
          const handles = Object.keys(collections)
          // Pick the first handle as the target to update
          const targetHandle = handles[0]
          const otherHandles = handles.slice(1)

          // Write initial config file
          const configPath = path.join(tmpDir, 'madori.config.ts')
          const initialContent = generateConfigFile(collections)
          await fs.writeFile(configPath, initialContent, 'utf-8')

          const writer = new FileConfigWriter(configPath)

          // Read all other collections before the update
          const beforeConfigs: Record<string, CollectionConfig | null> = {}
          for (const h of otherHandles) {
            beforeConfigs[h] = await writer.readCollectionConfig(h)
          }

          // Update the target collection with new config (matching handle)
          const updatedConfig: CollectionConfig = { ...newConfig, handle: targetHandle }
          await writer.writeCollectionConfig(targetHandle, updatedConfig)

          // Read all other collections after the update
          for (const h of otherHandles) {
            const afterConfig = await writer.readCollectionConfig(h)
            expect(afterConfig).toEqual(beforeConfigs[h])
          }
        },
      ),
      { numRuns: 50 },
    )
  })
})
