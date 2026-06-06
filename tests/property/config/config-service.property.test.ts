// Property 5: Config values write/read round-trip
// Property 6: Path values must be non-empty strings

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { MadoriConfigService } from '@/lib/settings/config'

/**
 * Validates: Requirements 3.2, 3.4
 *
 * Property 5: For any valid partial MadoriConfigInput update, writing the values
 * to madori.config.ts via the config service and reading them back SHALL produce
 * values equal to the submitted update merged with prior config state.
 *
 * Property 6: For any string that is empty or consists solely of whitespace
 * characters, submitting it as a path value (contentPath, resourcesPath, usersPath,
 * assetsPath) in the config update SHALL be rejected with a validation error.
 */

// --- Generators ---

/** Arbitrary non-empty path string (always valid) */
const validPathArb = fc
  .stringMatching(/^\.?\/[a-z][a-z0-9\-_\/]{0,20}$/)
  .filter((s) => s.trim().length > 0)

/** Arbitrary non-empty string for config string fields */
const nonEmptyStringArb = fc
  .stringMatching(/^[a-z][a-z0-9\-_\/]{0,20}$/)
  .filter((s) => s.trim().length > 0)

/** Arbitrary partial config update with valid path values */
const validPartialConfigArb = fc.record(
  {
    contentPath: validPathArb,
    resourcesPath: validPathArb,
    usersPath: validPathArb,
    assetsPath: validPathArb,
  },
  { requiredKeys: [] },
).filter((obj) => Object.keys(obj).length > 0)

/** Arbitrary empty or whitespace-only strings */
const emptyOrWhitespaceArb = fc.oneof(
  fc.constant(''),
  fc.constant(' '),
  fc.constant('  '),
  fc.constant('\t'),
  fc.constant('\n'),
  fc.constant('   \t  '),
  fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 10 })
    .map((chars) => chars.join('')),
)

/** The four path field names */
const pathFieldArb = fc.constantFrom(
  'contentPath' as const,
  'resourcesPath' as const,
  'usersPath' as const,
  'assetsPath' as const,
)

// --- Helpers ---

/**
 * Creates a minimal madori.config.ts file with known defaults.
 * Note: Omits the type import since it has no runtime effect and the temp file
 * can't resolve the relative path. Dynamic import() works fine without it.
 */
function createBaseConfigFile(): string {
  return `const config = {
  contentPath: './content',
  resourcesPath: './resources',
  usersPath: './users',
  assetsPath: './public/assets',
  cp: {
    enabled: true,
    path: '/cp',
  },
  graphql: {
    enabled: true,
    path: '/api/graphql',
    introspection: true,
  },
}

export default config
`
}

// --- Test Setup ---

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-config-svc-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// --- Property Tests ---

describe('Property 5: Config values write/read round-trip', () => {
  it('writing valid partial config and reading back preserves the updated path values', async () => {
    await fc.assert(
      fc.asyncProperty(validPartialConfigArb, async (partialUpdate) => {
        // Create a fresh config file for each run with a unique name
        const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        const configFile = path.join(tmpDir, `config-${uniqueId}.ts`)
        await fs.writeFile(configFile, createBaseConfigFile(), 'utf-8')

        const service = new MadoriConfigService(configFile)

        // Read initial state
        const initial = await service.read()

        // Write the partial update
        await service.write(partialUpdate)

        // Due to Node.js module caching in the test environment (dynamic import
        // cache keyed by absolute path, ignoring query params in some runtimes),
        // we verify the round-trip by copying the written file to a brand new
        // path and reading from there — guaranteeing no cache hit.
        const readCopyFile = path.join(tmpDir, `readcopy-${uniqueId}-${Date.now()}.ts`)
        await fs.copyFile(configFile, readCopyFile)
        const reader = new MadoriConfigService(readCopyFile)
        const readBack = await reader.read()

        // Assert: each updated field matches the submitted value
        for (const [key, value] of Object.entries(partialUpdate)) {
          expect((readBack as Record<string, unknown>)[key]).toBe(value)
        }

        // Assert: fields not in the update remain unchanged
        const pathFields = ['contentPath', 'resourcesPath', 'usersPath', 'assetsPath'] as const
        for (const field of pathFields) {
          if (!(field in partialUpdate)) {
            expect(readBack[field]).toBe(initial[field])
          }
        }
      }),
      { numRuns: 30 },
    )
  })
})

describe('Property 6: Path values must be non-empty strings', () => {
  it('validate rejects empty or whitespace-only path values', async () => {
    await fc.assert(
      fc.asyncProperty(pathFieldArb, emptyOrWhitespaceArb, async (field, invalidValue) => {
        const configFile = path.join(tmpDir, `config-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`)
        await fs.writeFile(configFile, createBaseConfigFile(), 'utf-8')

        const service = new MadoriConfigService(configFile)

        const update = { [field]: invalidValue }
        const result = await service.validate(update)

        // Must be rejected
        expect(result.valid).toBe(false)
        expect(result.errors.length).toBeGreaterThan(0)
        expect(result.errors[0].field).toBe(field)
      }),
      { numRuns: 50 },
    )
  })

  it('validate accepts non-empty, non-whitespace path values', async () => {
    await fc.assert(
      fc.asyncProperty(pathFieldArb, validPathArb, async (field, validValue) => {
        const configFile = path.join(tmpDir, `config-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`)
        await fs.writeFile(configFile, createBaseConfigFile(), 'utf-8')

        const service = new MadoriConfigService(configFile)

        const update = { [field]: validValue }
        const result = await service.validate(update)

        // Must be accepted
        expect(result.valid).toBe(true)
        expect(result.errors.length).toBe(0)
      }),
      { numRuns: 50 },
    )
  })

  it('write rejects empty or whitespace-only path values', async () => {
    await fc.assert(
      fc.asyncProperty(pathFieldArb, emptyOrWhitespaceArb, async (field, invalidValue) => {
        const configFile = path.join(tmpDir, `config-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`)
        await fs.writeFile(configFile, createBaseConfigFile(), 'utf-8')

        const service = new MadoriConfigService(configFile)

        const update = { [field]: invalidValue }

        // write() should throw due to validation failure
        await expect(service.write(update)).rejects.toThrow(/validation failed/i)
      }),
      { numRuns: 30 },
    )
  })
})
