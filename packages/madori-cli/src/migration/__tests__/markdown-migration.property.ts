import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import YAML from 'yaml'
import { scanMarkdownFiles, deriveTitle, deriveSlug } from '../markdown-scanner.js'

/**
 * Validates: Requirements 7.1, 7.2, 7.3, 7.6
 * Property 13: Markdown migration preserves frontmatter
 * Property 14: Markdown migration respects collection placement
 * Property 15: Filename-derived title and slug
 */

/**
 * Generator for simple frontmatter values: strings, numbers, booleans.
 * Avoids objects and arrays for simplicity (gray-matter handles them but
 * they complicate equality comparisons).
 */
const simpleFrontmatterValue = fc.oneof(
  fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes('\n') && !s.includes(':') && !s.includes('#')),
  fc.integer({ min: -1000, max: 1000 }),
  fc.boolean()
)

/**
 * Generator for frontmatter key names: lowercase alpha keys without reserved
 * YAML characters.
 */
const frontmatterKey = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => /^[a-z][a-z0-9_]*$/.test(s))
  .filter((s) => s !== 'title' && s !== 'slug') // avoid overriding title/slug derivation

/**
 * Generator for a random frontmatter object (1-5 key-value pairs).
 */
const frontmatterObject = fc
  .uniqueArray(frontmatterKey, { minLength: 1, maxLength: 5 })
  .chain((keys) =>
    fc.tuple(...keys.map(() => simpleFrontmatterValue)).map((values) => {
      const obj: Record<string, unknown> = {}
      keys.forEach((k, i) => {
        obj[k] = values[i]
      })
      return obj
    })
  )

/**
 * Generator for valid filenames: alphanumeric + hyphens/underscores, ending in .md.
 */
const validFilename = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => /^[a-z][a-z0-9-_]*$/.test(s))
  .map((s) => `${s}.md`)

describe('Markdown Migration — Property Tests', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'md-migration-prop-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  /**
   * Property 13: Markdown migration preserves frontmatter
   *
   * For any Markdown file with valid YAML frontmatter, scanMarkdownFiles
   * produces a ScannedFile whose frontmatter object contains all original
   * key-value pairs from the source file.
   *
   * **Validates: Requirements 7.1, 7.2**
   */
  it('Property 13: frontmatter key-value pairs are preserved through scanning', async () => {
    await fc.assert(
      fc.asyncProperty(frontmatterObject, async (fm) => {
        // Use proper YAML serialization to avoid escaping issues
        const yamlContent = YAML.stringify(fm)
        const fileContent = `---\n${yamlContent}---\n\n# Test content`

        const filePath = path.join(tmpDir, 'test-file.md')
        await fs.writeFile(filePath, fileContent, 'utf-8')

        // Scan the directory
        const results = []
        for await (const file of scanMarkdownFiles(tmpDir)) {
          results.push(file)
        }

        expect(results).toHaveLength(1)
        const scanned = results[0]

        // All original keys must be present in the scanned frontmatter
        expect(scanned.frontmatter).not.toBeNull()
        for (const [key, value] of Object.entries(fm)) {
          expect(scanned.frontmatter).toHaveProperty(key)
          expect(scanned.frontmatter![key]).toEqual(value)
        }

        // Clean up for next iteration
        await fs.unlink(filePath)
      }),
      { numRuns: 40 }
    )
  })

  /**
   * Property 14: Markdown migration respects collection placement
   *
   * For any collection handle and set of markdown files, deriveSlug produces
   * a valid filename component (no slashes, no spaces, lowercase, alphanumeric +
   * hyphens only) that can be safely placed in content/collections/<handle>/.
   *
   * **Validates: Requirements 7.3**
   */
  it('Property 14: deriveSlug produces valid path-safe filenames for collection placement', () => {
    fc.assert(
      fc.property(validFilename, (filename) => {
        const slug = deriveSlug(filename)

        // Slug must be a valid path component for content/collections/<handle>/<slug>.md
        expect(slug.length).toBeGreaterThan(0)
        expect(slug).not.toContain('/')
        expect(slug).not.toContain('\\')
        expect(slug).not.toContain(' ')
        expect(slug).toMatch(/^[a-z0-9-]+$/)
      }),
      { numRuns: 200 }
    )
  })

  it('Property 14: scanMarkdownFiles slug maps to correct collection path pattern', async () => {
    await fc.assert(
      fc.asyncProperty(validFilename, async (filename) => {
        // Write a file with no frontmatter so slug is derived from filename
        const filePath = path.join(tmpDir, filename)
        await fs.writeFile(filePath, '# Content\n\nSome text.', 'utf-8')

        const results = []
        for await (const file of scanMarkdownFiles(tmpDir)) {
          results.push(file)
        }

        expect(results).toHaveLength(1)
        const scanned = results[0]

        // The slug should be usable as a filename inside content/collections/<handle>/
        const collectionHandle = 'blog'
        const expectedPath = `content/collections/${collectionHandle}/${scanned.slug}.md`
        expect(expectedPath).toMatch(/^content\/collections\/[a-z0-9-]+\/[a-z0-9-]+\.md$/)

        // Clean up for next iteration
        await fs.unlink(filePath)
      }),
      { numRuns: 40 }
    )
  })

  /**
   * Property 15: Filename-derived title and slug
   *
   * For any filename containing only alphanumeric, hyphens, and underscores
   * (plus .md extension):
   * - deriveTitle produces a non-empty string with no hyphens or underscores
   * - deriveSlug produces a lowercase string with no underscores or spaces,
   *   only alphanumeric + hyphens
   * - deriveSlug output is idempotent when the input is already a valid slug
   *
   * **Validates: Requirements 7.6**
   */
  it('Property 15: deriveTitle produces non-empty string with no hyphens or underscores', () => {
    fc.assert(
      fc.property(validFilename, (filename) => {
        const title = deriveTitle(filename)

        expect(title.length).toBeGreaterThan(0)
        expect(title).not.toContain('-')
        expect(title).not.toContain('_')
      }),
      { numRuns: 200 }
    )
  })

  it('Property 15: deriveSlug produces lowercase string with only alphanumeric + hyphens', () => {
    fc.assert(
      fc.property(validFilename, (filename) => {
        const slug = deriveSlug(filename)

        expect(slug.length).toBeGreaterThan(0)
        expect(slug).not.toContain('_')
        expect(slug).not.toContain(' ')
        expect(slug).toMatch(/^[a-z0-9-]+$/)
        expect(slug).toBe(slug.toLowerCase())
      }),
      { numRuns: 200 }
    )
  })

  it('Property 15: deriveSlug is idempotent for already-valid slugs', () => {
    // Generate strings that are already valid slugs (lowercase alpha + hyphens, no leading/trailing hyphens)
    const validSlug = fc
      .string({ minLength: 1, maxLength: 30 })
      .filter((s) => /^[a-z][a-z0-9-]*[a-z0-9]$/.test(s) || /^[a-z]$/.test(s))
      .filter((s) => !s.includes('--')) // no consecutive hyphens

    fc.assert(
      fc.property(validSlug, (slug) => {
        // If we pass a valid slug as filename (with .md), deriveSlug should return the same value
        const result = deriveSlug(`${slug}.md`)
        expect(result).toBe(slug)
      }),
      { numRuns: 200 }
    )
  })
})
