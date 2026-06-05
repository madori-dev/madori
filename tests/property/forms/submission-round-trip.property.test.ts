// Property 11: Form Submission Round-Trip

import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { FormOperations } from '@/lib/content/forms'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'
import { InMemoryContentCache } from '@/lib/cache/store'

/**
 * Validates: Requirements 10.1, 10.3
 *
 * Property: For any valid form definition and any submission data that passes
 * validation, submitting the form and then fetching the submission by ID SHALL
 * return data identical to the original submission payload.
 */

// --- In-memory test infrastructure ---

class InMemoryFS implements FileSystemAdapter {
  private files = new Map<string, string>()

  async readFile(filePath: string): Promise<string> {
    const content = this.files.get(filePath)
    if (!content) throw new Error(`File not found: ${filePath}`)
    return content
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    this.files.set(filePath, content)
  }

  async deleteFile(filePath: string): Promise<void> {
    this.files.delete(filePath)
  }

  async exists(filePath: string): Promise<boolean> {
    if (this.files.has(filePath)) return true
    for (const key of this.files.keys()) {
      if (key.startsWith(filePath + '/')) return true
    }
    return false
  }

  async listFiles(directory: string, pattern?: string): Promise<string[]> {
    const results: string[] = []
    const ext = pattern ? pattern.replace(/^\*+/, '') : ''
    for (const key of this.files.keys()) {
      if (key.startsWith(directory + '/')) {
        const relative = key.slice(directory.length + 1)
        if (!relative.includes('/') && (!ext || key.endsWith(ext))) {
          results.push(relative)
        }
      }
    }
    return results.sort()
  }

  async listDirectories(): Promise<string[]> { return [] }
  async mkdir(): Promise<void> {}
  async copyFile(src: string, dest: string): Promise<void> {
    const content = await this.readFile(src)
    await this.writeFile(dest, content)
  }
  async moveFile(src: string, dest: string): Promise<void> {
    const content = await this.readFile(src)
    await this.writeFile(dest, content)
    await this.deleteFile(src)
  }
}

/**
 * A YAML parser that handles nested data objects correctly for round-trip testing.
 * Uses a simple line-based approach matching the format produced by serializeYaml.
 */
function createTestParser(): ContentParser {
  return {
    parseYaml<T>(content: string): T {
      const lines = content.split('\n')
      const result: Record<string, unknown> = {}
      let currentSection = ''
      let sectionObj: Record<string, unknown> = {}

      for (const line of lines) {
        if (line === '' || line.trim() === '') continue

        // Top-level key with nested object (e.g. "data:")
        if (/^[a-z_]+:$/.test(line.trim())) {
          // Save any previous section
          if (currentSection) {
            result[currentSection] = sectionObj
          }
          currentSection = line.trim().replace(':', '')
          sectionObj = {}
          continue
        }

        // Nested key-value under a section (indented with 2 spaces)
        if (currentSection && line.startsWith('  ')) {
          const colonIdx = line.indexOf(':')
          if (colonIdx > 0) {
            const key = line.slice(2, colonIdx).trim()
            const rawValue = line.slice(colonIdx + 1).trim()
            sectionObj[key] = unquote(rawValue)
          }
          continue
        }

        // Top-level key-value
        const colonIdx = line.indexOf(':')
        if (colonIdx > 0) {
          // Save any previous section
          if (currentSection) {
            result[currentSection] = sectionObj
            currentSection = ''
            sectionObj = {}
          }
          const key = line.slice(0, colonIdx).trim()
          const rawValue = line.slice(colonIdx + 1).trim()
          result[key] = unquote(rawValue)
        }
      }

      // Save final section
      if (currentSection) {
        result[currentSection] = sectionObj
      }

      return result as T
    },

    parseMarkdown(content: string) {
      return { frontmatter: {}, content }
    },

    serializeYaml(data: unknown): string {
      const obj = data as Record<string, unknown>
      const lines: string[] = []
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          lines.push(`${key}:`)
          for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
            lines.push(`  ${subKey}: ${quote(String(subValue))}`)
          }
        } else {
          lines.push(`${key}: ${quote(String(value))}`)
        }
      }
      return lines.join('\n') + '\n'
    },

    serializeMarkdown() { return '' },
  }
}

function quote(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
  return `"${escaped}"`
}

function unquote(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value
      .slice(1, -1)
      .replace(/\\(["\\nrt])/g, (_, ch) => {
        switch (ch) {
          case 'n': return '\n'
          case 'r': return '\r'
          case 't': return '\t'
          case '"': return '"'
          case '\\': return '\\'
          default: return ch
        }
      })
  }
  return value
}

// --- Generators ---

/** Arbitrary field handle — valid identifier-like strings */
const fieldHandleArb = fc.stringMatching(/^[a-z][a-z0-9_]{0,12}$/)

/** Arbitrary string field value — avoids newlines since YAML serialization is line-based */
const fieldValueArb = fc.string({ minLength: 0, maxLength: 50 })
  .map(s => s.replace(/\n/g, ' ').replace(/\r/g, ''))

/** Arbitrary form data: a dictionary of field handles to string values */
const formDataArb = fc.dictionary(fieldHandleArb, fieldValueArb, {
  minKeys: 1,
  maxKeys: 6,
}).filter(d => {
  // Exclude the honeypot field handle so it doesn't interfere with submission
  return !('_honeypot' in d)
})

/** Arbitrary form handle */
const formHandleArb = fc.stringMatching(/^[a-z][a-z0-9_]{2,10}$/)

// --- Property Tests ---

describe('Property 11: Form Submission Round-Trip', () => {
  let fs: InMemoryFS
  let formOps: FormOperations

  const contentPath = '/content'
  const resourcesPath = '/resources'

  beforeEach(() => {
    fs = new InMemoryFS()
    const parser = createTestParser()
    const cache = new InMemoryContentCache()
    formOps = new FormOperations(fs, parser, cache, contentPath, resourcesPath)
  })

  it('submitted form data can be fetched by ID and matches the original payload', async () => {
    await fc.assert(
      fc.asyncProperty(
        formHandleArb,
        formDataArb,
        async (handle, data) => {
          // Reset FS and cache for each iteration to avoid cross-contamination
          fs = new InMemoryFS()
          const parser = createTestParser()
          const cache = new InMemoryContentCache()
          formOps = new FormOperations(fs, parser, cache, contentPath, resourcesPath)

          // Set up form blueprint so submitForm doesn't throw NotFoundError
          await fs.writeFile(
            `/resources/blueprints/forms/${handle}.yaml`,
            `handle: "${handle}"\ndisplay: "${handle}"\nfields:\n`
          )

          // Submit the form
          const submission = await formOps.submitForm(handle, data)
          expect(submission).not.toBeNull()

          // Fetch the submission by ID
          const fetched = await formOps.getSubmission(handle, submission!.id)
          expect(fetched).not.toBeNull()

          // Assert the fetched data is identical to the original submission payload
          expect(fetched!.id).toBe(submission!.id)
          expect(fetched!.form).toBe(handle)
          expect(fetched!.data).toEqual(data)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('submission metadata (form handle, timestamp) is preserved through round-trip', async () => {
    await fc.assert(
      fc.asyncProperty(
        formHandleArb,
        formDataArb,
        async (handle, data) => {
          fs = new InMemoryFS()
          const parser = createTestParser()
          const cache = new InMemoryContentCache()
          formOps = new FormOperations(fs, parser, cache, contentPath, resourcesPath)

          await fs.writeFile(
            `/resources/blueprints/forms/${handle}.yaml`,
            `handle: "${handle}"\ndisplay: "${handle}"\nfields:\n`
          )

          const submission = await formOps.submitForm(handle, data)
          expect(submission).not.toBeNull()

          const fetched = await formOps.getSubmission(handle, submission!.id)
          expect(fetched).not.toBeNull()

          // Form handle preserved
          expect(fetched!.form).toBe(submission!.form)
          // Timestamp preserved
          expect(fetched!.submittedAt).toBe(submission!.submittedAt)
        },
      ),
      { numRuns: 100 },
    )
  })
})
