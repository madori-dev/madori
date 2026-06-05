// Feature: phase-zero-completion, Property 12: Form Export Completeness

import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { FormOperations } from '@/lib/content/forms'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import { InMemoryContentCache } from '@/lib/cache/store'
import type { FileSystemAdapter } from '@/lib/fs/adapter'

/**
 * Validates: Requirements 10.4, 10.5
 *
 * Property 12: For any form with stored submissions, exporting to CSV SHALL produce
 * output where the column headers are a superset of all unique field handles across
 * submissions, and exporting to JSON SHALL produce a valid JSON array with length
 * equal to the total submission count.
 */

// --- In-Memory File System ---

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

// --- Generators ---

/** Generates a valid field handle (simple alphanumeric identifier) */
const handleArb = fc.stringMatching(/^[a-z][a-z0-9_]{1,14}$/)

/** Generates a simple string value suitable for form field data */
const fieldValueArb = fc.oneof(
  fc.string({ minLength: 1, maxLength: 40 }).filter((s) => !s.includes('\n')),
  fc.integer({ min: -1000, max: 1000 }).map(String),
)

/**
 * Generates a single submission's data: a record of field handles → values.
 * Each submission can have a different set of field handles (varying schema).
 */
const submissionDataArb = fc
  .uniqueArray(handleArb, { minLength: 1, maxLength: 6 })
  .chain((handles) =>
    fc.tuple(...handles.map(() => fieldValueArb)).map((values) => {
      const data: Record<string, string> = {}
      handles.forEach((h, i) => {
        data[h] = values[i]
      })
      return data
    })
  )

/**
 * Generates a list of submissions (1-10) with potentially different field handles
 * to test that CSV headers are the superset of all unique handles.
 */
const submissionsArb = fc.array(submissionDataArb, { minLength: 1, maxLength: 10 })

// --- Property Tests ---

describe('Property 12: Form Export Completeness', () => {
  let memFs: InMemoryFS
  let forms: FormOperations

  const contentPath = '/content'
  const resourcesPath = '/resources'
  const formHandle = 'testform'

  beforeEach(() => {
    memFs = new InMemoryFS()
    const parser = new MarkdownYamlParser()
    const cache = new InMemoryContentCache()
    forms = new FormOperations(memFs, parser, cache, contentPath, resourcesPath)
  })

  /**
   * Helper: write submission YAML files directly to the in-memory FS.
   * This bypasses submitForm (which requires blueprint) to focus on export logic.
   */
  async function seedSubmissions(submissions: Record<string, string>[]): Promise<void> {
    // Create a form blueprint so getForm works if needed
    await memFs.writeFile(
      `${resourcesPath}/blueprints/forms/${formHandle}.yaml`,
      `handle: ${formHandle}\ndisplay: Test Form\nfields: []\n`
    )

    const parser = new MarkdownYamlParser()
    for (let i = 0; i < submissions.length; i++) {
      const id = `id-${i}-${Date.now()}`
      const submittedAt = new Date(Date.now() + i * 1000).toISOString()
      const yamlData = {
        id,
        form: formHandle,
        submitted_at: submittedAt,
        data: submissions[i],
      }
      const yaml = parser.serializeYaml(yamlData)
      const filename = `${submittedAt.replace(/[:.]/g, '-').slice(0, 19)}-${id}.yaml`
      await memFs.writeFile(`${contentPath}/forms/${formHandle}/${filename}`, yaml)
    }
  }

  it('CSV headers are a superset of all unique field handles across submissions', async () => {
    await fc.assert(
      fc.asyncProperty(submissionsArb, async (submissions) => {
        // Reset FS state
        memFs = new InMemoryFS()
        const parser = new MarkdownYamlParser()
        const cache = new InMemoryContentCache()
        forms = new FormOperations(memFs, parser, cache, contentPath, resourcesPath)

        await seedSubmissions(submissions)

        const csv = await forms.exportCsv(formHandle)
        expect(csv).not.toBe('')

        // Parse headers from first line
        const lines = csv.split('\n')
        const headers = lines[0].split(',')

        // Collect all unique field handles from submissions
        const allHandles = new Set<string>()
        for (const sub of submissions) {
          for (const key of Object.keys(sub)) {
            allHandles.add(key)
          }
        }

        // CSV headers must be a superset of all field handles
        for (const handle of allHandles) {
          expect(headers).toContain(handle)
        }
      }),
      { numRuns: 100 },
    )
  })

  it('JSON array length equals total submission count', async () => {
    await fc.assert(
      fc.asyncProperty(submissionsArb, async (submissions) => {
        // Reset FS state
        memFs = new InMemoryFS()
        const parser = new MarkdownYamlParser()
        const cache = new InMemoryContentCache()
        forms = new FormOperations(memFs, parser, cache, contentPath, resourcesPath)

        await seedSubmissions(submissions)

        const json = await forms.exportJson(formHandle)
        const parsed = JSON.parse(json)

        expect(Array.isArray(parsed)).toBe(true)
        expect(parsed.length).toBe(submissions.length)
      }),
      { numRuns: 100 },
    )
  })

  it('CSV contains a row for every submission (header + N data rows)', async () => {
    await fc.assert(
      fc.asyncProperty(submissionsArb, async (submissions) => {
        // Reset FS state
        memFs = new InMemoryFS()
        const parser = new MarkdownYamlParser()
        const cache = new InMemoryContentCache()
        forms = new FormOperations(memFs, parser, cache, contentPath, resourcesPath)

        await seedSubmissions(submissions)

        const csv = await forms.exportCsv(formHandle)
        const lines = csv.split('\n').filter((l) => l.length > 0)

        // 1 header row + N data rows
        expect(lines.length).toBe(submissions.length + 1)
      }),
      { numRuns: 100 },
    )
  })
})
