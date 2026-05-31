// Property 6: Format preservation on update

import { describe, it, expect, afterEach } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { DefinitionLoader } from '@/lib/definitions/loader'

/**
 * Validates: Requirements 3.5, 6.2, 7.2
 *
 * Property: For any existing definition or content file in a given format
 * (YAML or JSON), updating that file through the CRUD operations SHALL
 * preserve the original file format — a YAML file remains YAML, a JSON
 * file remains JSON.
 */

// --- Generators ---

/** Arbitrary format: yaml or json */
const formatArb = fc.constantFrom('yaml', 'json') as fc.Arbitrary<'yaml' | 'json'>

/** Arbitrary valid handle: lowercase letter followed by alphanumeric/hyphens */
const handleArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/).filter((s) => s.length > 0)

/** Arbitrary entity type */
const entityTypeArb = fc.constantFrom('taxonomies', 'globals', 'navigations', 'forms') as fc.Arbitrary<
  'taxonomies' | 'globals' | 'navigations' | 'forms'
>

/** Arbitrary definition data that is valid for any entity type (title is always required) */
const definitionDataArb = fc.record({
  title: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
})

/** Arbitrary updated definition data (different title) */
const updatedDefinitionDataArb = fc.record({
  title: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
})

// --- Helpers ---

function serializeDefinition(format: 'yaml' | 'json', data: Record<string, unknown>): string {
  if (format === 'json') {
    return JSON.stringify(data, null, 2) + '\n'
  }
  // Simple YAML serialization for title-only objects
  return Object.entries(data)
    .map(([key, value]) => `${key}: "${value}"`)
    .join('\n') + '\n'
}

function extensionForFormat(format: 'yaml' | 'json'): string {
  return format === 'json' ? '.json' : '.yaml'
}

function isValidJson(content: string): boolean {
  try {
    JSON.parse(content)
    return true
  } catch {
    return false
  }
}

function isValidYaml(content: string): boolean {
  // YAML files should NOT be valid JSON (unless trivially so)
  // A YAML file written by our serializer uses key: value syntax
  // The simplest check: it should not start with { or [
  const trimmed = content.trim()
  return !trimmed.startsWith('{') && !trimmed.startsWith('[')
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

describe('Property 6: Format preservation on update', () => {
  it('update preserves original file format (YAML stays YAML, JSON stays JSON)', async () => {
    await fc.assert(
      fc.asyncProperty(
        formatArb,
        handleArb,
        entityTypeArb,
        definitionDataArb,
        updatedDefinitionDataArb,
        async (format, handle, entityType, initialData, updatedData) => {
          // Create a temp directory structure
          const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-fmt-'))
          tmpDirs.push(tmpDir)

          const entityDir = path.join(tmpDir, entityType)
          await fs.mkdir(entityDir, { recursive: true })

          // Write initial definition file in the chosen format
          const ext = extensionForFormat(format)
          const filePath = path.join(entityDir, `${handle}${ext}`)
          const content = serializeDefinition(format, initialData)
          await fs.writeFile(filePath, content, 'utf-8')

          // Update via DefinitionLoader
          const loader = new DefinitionLoader(tmpDir)
          await loader.update(entityType, handle, updatedData)

          // Read the file back
          const updatedContent = await fs.readFile(filePath, 'utf-8')

          // Assert file extension hasn't changed (file still exists at same path)
          const files = await fs.readdir(entityDir)
          const matchingFiles = files.filter((f) => f.startsWith(handle))
          expect(matchingFiles).toHaveLength(1)
          expect(matchingFiles[0]).toBe(`${handle}${ext}`)

          // Assert content format is preserved
          if (format === 'json') {
            expect(isValidJson(updatedContent)).toBe(true)
          } else {
            expect(isValidYaml(updatedContent)).toBe(true)
          }

          // Assert the updated data is correct
          const reloaded = await loader.load(entityType, handle)
          expect(reloaded).toEqual(updatedData)
        },
      ),
      { numRuns: 50 },
    )
  })
})
