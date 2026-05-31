// Feature: project-madori, Property 1: Content serialization round-trip

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { MarkdownYamlParser } from '@/lib/fs/parser'

/**
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.8, 7.1, 7.3, 14.1
 *
 * Property: For any valid frontmatter and markdown content,
 * serializing to file format and parsing back produces semantically equivalent data.
 */

const parser = new MarkdownYamlParser()

// --- Generators ---

/**
 * Generate YAML-safe string values (no special YAML characters that break round-trip).
 * Avoids: leading/trailing whitespace, `---` sequences, null-like strings, empty strings.
 */
const yamlSafeString = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => {
    const trimmed = s.trim()
    // Must have content after trimming
    if (trimmed.length === 0) return false
    // Avoid frontmatter delimiters
    if (trimmed.includes('---')) return false
    // Avoid YAML null/boolean literals that won't round-trip as strings
    const lower = trimmed.toLowerCase()
    if (['null', 'true', 'false', 'yes', 'no', '~', 'on', 'off'].includes(lower)) return false
    // Avoid strings that look like numbers (YAML parses them as numbers)
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return false
    if (/^0x[0-9a-fA-F]+$/.test(trimmed)) return false
    if (/^0o[0-7]+$/.test(trimmed)) return false
    // Avoid strings starting with special YAML indicators that cause issues
    if (/^[{[\]&*!|>'"%@`]/.test(trimmed)) return false
    // Avoid control characters
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s)) return false
    return true
  })

/**
 * Generate a YAML-safe key (valid identifier-like string).
 */
const yamlKey = fc
  .stringMatching(/^[a-z][a-z0-9_]{0,19}$/)
  .filter((s) => s.length >= 1)

/**
 * Generate frontmatter values that YAML can round-trip cleanly.
 */
const yamlValue: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 4, arbitrary: yamlSafeString },
  { weight: 3, arbitrary: fc.integer({ min: -1000000, max: 1000000 }) },
  { weight: 2, arbitrary: fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }).filter((n) => !Object.is(n, -0)) },
  { weight: 2, arbitrary: fc.boolean() },
  { weight: 2, arbitrary: fc.array(yamlSafeString, { minLength: 1, maxLength: 5 }) },
)

/**
 * Generate a frontmatter object with YAML-safe keys and values.
 */
const frontmatterArb = fc
  .array(fc.tuple(yamlKey, yamlValue), { minLength: 1, maxLength: 8 })
  .map((entries) => {
    const obj: Record<string, unknown> = {}
    for (const [key, value] of entries) {
      obj[key] = value
    }
    return obj
  })
  .filter((obj) => Object.keys(obj).length > 0)

/**
 * Generate nested frontmatter (with one level of nesting).
 */
const nestedFrontmatterArb = fc
  .tuple(frontmatterArb, fc.array(fc.tuple(yamlKey, frontmatterArb), { minLength: 0, maxLength: 2 }))
  .map(([flat, nested]) => {
    const obj: Record<string, unknown> = { ...flat }
    for (const [key, value] of nested) {
      obj[key] = value
    }
    return obj
  })
  .filter((obj) => Object.keys(obj).length > 0)

/**
 * Generate markdown content that won't be confused with frontmatter delimiters.
 * Avoids `---` at the start of a line.
 */
const markdownContentArb = fc
  .string({ minLength: 0, maxLength: 500 })
  .filter((s) => {
    // No frontmatter delimiters
    if (s.includes('---')) return false
    // No control characters except newline, tab, carriage return
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s)) return false
    return true
  })
  .map((s) => s.trim())

// --- Property Tests ---

describe('Property 1: Content Serialization Round-Trip', () => {
  it('markdown serialize → parse round-trip preserves frontmatter and content', () => {
    fc.assert(
      fc.property(nestedFrontmatterArb, markdownContentArb, (frontmatter, content) => {
        const serialized = parser.serializeMarkdown(frontmatter, content)
        const parsed = parser.parseMarkdown(serialized)

        // Frontmatter should be semantically equivalent
        expect(parsed.frontmatter).toEqual(frontmatter)

        // Content should be preserved (trimmed, as the parser trims)
        expect(parsed.content).toBe(content)
      }),
      { numRuns: 100 },
    )
  })

  it('YAML serialize → parse round-trip preserves data', () => {
    fc.assert(
      fc.property(nestedFrontmatterArb, (data) => {
        const serialized = parser.serializeYaml(data)
        const parsed = parser.parseYaml<Record<string, unknown>>(serialized)

        expect(parsed).toEqual(data)
      }),
      { numRuns: 100 },
    )
  })

  it('markdown round-trip is idempotent (double serialize produces same result)', () => {
    fc.assert(
      fc.property(nestedFrontmatterArb, markdownContentArb, (frontmatter, content) => {
        const serialized1 = parser.serializeMarkdown(frontmatter, content)
        const parsed1 = parser.parseMarkdown(serialized1)
        const serialized2 = parser.serializeMarkdown(parsed1.frontmatter, parsed1.content)

        expect(serialized2).toBe(serialized1)
      }),
      { numRuns: 100 },
    )
  })

  it('YAML round-trip is idempotent (double serialize produces same result)', () => {
    fc.assert(
      fc.property(nestedFrontmatterArb, (data) => {
        const serialized1 = parser.serializeYaml(data)
        const parsed1 = parser.parseYaml<Record<string, unknown>>(serialized1)
        const serialized2 = parser.serializeYaml(parsed1)

        expect(serialized2).toBe(serialized1)
      }),
      { numRuns: 100 },
    )
  })
})
