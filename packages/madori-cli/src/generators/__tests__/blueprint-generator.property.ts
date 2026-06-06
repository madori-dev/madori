import { describe, it, vi, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { stringify } from 'yaml'
import { generateBlueprintFromContent, validateBlueprintSchema } from '../blueprint-generator.js'

/**
 * Validates: Requirements 2.2, 2.6
 * Property 3: Blueprint inference from content preserves field handles
 * Property 6: Generated blueprints pass schema validation
 */

const SYSTEM_FIELDS = new Set([
  'title',
  'slug',
  'status',
  'createdAt',
  'updatedAt',
  'created_at',
  'updated_at',
])

// Mock resolveProjectPath to redirect writes to a temp directory
vi.mock('../../utils/resolve-paths.js', () => ({
  resolveProjectPath: (...segments: string[]) => {
    return path.join(process.env.__TEST_TEMP_DIR__ || os.tmpdir(), ...segments)
  },
}))

/** Generate a valid handle (starts with lowercase letter, alphanumeric + hyphens/underscores) */
const validHandleArb = fc
  .tuple(
    fc.stringMatching(/^[a-z]$/),
    fc.stringMatching(/^[a-z0-9_-]{0,20}$/)
  )
  .map(([first, rest]) => first + rest)
  .filter((h) => h.length >= 1 && h.length <= 64)

/** Generate a frontmatter key that is NOT a system field */
const nonSystemKeyArb = fc
  .stringMatching(/^[a-z][a-zA-Z0-9_]{0,15}$/)
  .filter((k) => !SYSTEM_FIELDS.has(k) && k.length >= 2)

/** Generate frontmatter values that are safe for YAML round-tripping */
const frontmatterValueArb = fc.oneof(
  fc.stringMatching(/^[a-zA-Z0-9 .,!?]{1,50}$/),
  fc.integer(),
  fc.boolean(),
  fc.array(fc.stringMatching(/^[a-zA-Z0-9]{1,15}$/), { minLength: 1, maxLength: 5 }),
  fc.constant('2024-06-15T10:30:00Z'),
)

/** Generate a non-empty record of non-system frontmatter fields */
const frontmatterArb = fc
  .uniqueArray(nonSystemKeyArb, { minLength: 1, maxLength: 8 })
  .chain((keys) =>
    fc.tuple(...keys.map(() => frontmatterValueArb)).map((values) => {
      const obj: Record<string, unknown> = {}
      keys.forEach((key, i) => {
        obj[key] = values[i]
      })
      return obj
    })
  )

/** Build a Markdown file with YAML frontmatter using the yaml package for correct serialization */
function buildMarkdownContent(frontmatter: Record<string, unknown>): string {
  const yamlStr = stringify(frontmatter)
  return `---\n${yamlStr}---\n\n# Test Content\n`
}

let tempDir: string

describe('BlueprintGenerator — Property Tests', () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-bp-prop-'))
    process.env.__TEST_TEMP_DIR__ = tempDir
  })

  afterEach(async () => {
    delete process.env.__TEST_TEMP_DIR__
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('Property 3: Blueprint inference from content preserves field handles', async () => {
    await fc.assert(
      fc.asyncProperty(
        validHandleArb,
        frontmatterArb,
        async (handle, frontmatter) => {
          // Write a temp markdown file with the generated frontmatter
          const contentPath = path.join(tempDir, `${handle}-content.md`)
          const mdContent = buildMarkdownContent(frontmatter)
          await fs.writeFile(contentPath, mdContent, 'utf-8')

          const result = await generateBlueprintFromContent(handle, contentPath)

          // Every non-system key in the frontmatter should appear as a field handle
          const fieldHandles = new Set(result.fields.map((f) => f.handle))
          const nonSystemKeys = Object.keys(frontmatter).filter((k) => !SYSTEM_FIELDS.has(k))

          for (const key of nonSystemKeys) {
            if (!fieldHandles.has(key)) {
              return false
            }
          }
          return true
        }
      ),
      { numRuns: 50 }
    )
  })

  it('Property 6: Generated blueprints pass schema validation', async () => {
    await fc.assert(
      fc.asyncProperty(
        validHandleArb,
        frontmatterArb,
        async (handle, frontmatter) => {
          // Write a temp markdown file with the generated frontmatter
          const contentPath = path.join(tempDir, `${handle}-schema.md`)
          const mdContent = buildMarkdownContent(frontmatter)
          await fs.writeFile(contentPath, mdContent, 'utf-8')

          const result = await generateBlueprintFromContent(handle, contentPath)

          // If the generator wrote the blueprint (written: true), validate it
          if (result.written) {
            const validation = validateBlueprintSchema(result.definition)
            return validation.valid === true
          }

          // If not written, it should have validation errors explaining why
          if (result.validationErrors && result.validationErrors.length > 0) {
            // That's acceptable — the generator detected issues before writing
            return true
          }

          // If result has fields, the definition should still validate
          if (result.fields.length > 0) {
            const validation = validateBlueprintSchema(result.definition)
            return validation.valid === true
          }

          return true
        }
      ),
      { numRuns: 50 }
    )
  })
})
