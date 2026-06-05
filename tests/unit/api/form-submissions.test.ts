import { describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createFormHandlers } from '@/app/(cp)/api/handlers/forms'
import { FormOperations } from '@/lib/content/forms'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'
import { InMemoryContentCache } from '@/lib/cache/store'

/**
 * In-memory file system for testing form submission API handlers.
 */
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
    // Check exact match or if it's a directory prefix
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
        // Only immediate children (no deeper nesting)
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

function createMockParser(): ContentParser {
  return {
    parseYaml<T>(content: string): T {
      // Simple YAML parser for test data (uses JSON-serialized YAML for simplicity)
      const lines = content.split('\n')
      const result: Record<string, unknown> = {}
      let currentKey = ''
      let dataObj: Record<string, unknown> = {}
      let inData = false

      for (const line of lines) {
        if (line.startsWith('id:')) {
          result.id = line.replace('id:', '').trim().replace(/^"(.*)"$/, '$1')
        } else if (line.startsWith('form:')) {
          result.form = line.replace('form:', '').trim().replace(/^"(.*)"$/, '$1')
        } else if (line.startsWith('submitted_at:')) {
          result.submitted_at = line.replace('submitted_at:', '').trim().replace(/^"(.*)"$/, '$1')
        } else if (line.startsWith('handle:')) {
          result.handle = line.replace('handle:', '').trim().replace(/^"(.*)"$/, '$1')
        } else if (line.startsWith('display:')) {
          result.display = line.replace('display:', '').trim().replace(/^"(.*)"$/, '$1')
        } else if (line.startsWith('fields:')) {
          result.fields = []
        } else if (line === 'data:') {
          inData = true
          dataObj = {}
        } else if (inData && line.startsWith('  ')) {
          const [key, ...valueParts] = line.trim().split(':')
          dataObj[key.trim()] = valueParts.join(':').trim().replace(/^"(.*)"$/, '$1')
        }
      }

      if (inData) {
        result.data = dataObj
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
            lines.push(`  ${subKey}: "${String(subValue)}"`)
          }
        } else {
          lines.push(`${key}: "${String(value)}"`)
        }
      }
      return lines.join('\n') + '\n'
    },
    serializeMarkdown() { return '' },
  }
}

function makeRequest(method: string, url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), { method })
}

describe('Form Submission API Handlers', () => {
  let fs: InMemoryFS
  let formOps: FormOperations
  let handlers: ReturnType<typeof createFormHandlers>

  const contentPath = '/content'
  const resourcesPath = '/resources'

  beforeEach(async () => {
    fs = new InMemoryFS()
    const parser = createMockParser()
    const cache = new InMemoryContentCache()
    formOps = new FormOperations(fs, parser, cache, contentPath, resourcesPath)
    handlers = createFormHandlers(formOps)

    // Create a form blueprint
    await fs.writeFile(
      '/resources/blueprints/forms/contact.yaml',
      'handle: "contact"\ndisplay: "Contact Form"\nfields: []\n'
    )

    // Create submissions
    await fs.writeFile(
      '/content/forms/contact/2024-01-15T10-30-00-abc123.yaml',
      'id: "abc123"\nform: "contact"\nsubmitted_at: "2024-01-15T10:30:00.000Z"\ndata:\n  name: "Alice"\n  email: "alice@example.com"\n'
    )
    await fs.writeFile(
      '/content/forms/contact/2024-01-16T10-30-00-def456.yaml',
      'id: "def456"\nform: "contact"\nsubmitted_at: "2024-01-16T10:30:00.000Z"\ndata:\n  name: "Bob"\n  email: "bob@example.com"\n'
    )
  })

  describe('handleListSubmissions', () => {
    it('returns paginated submissions list', async () => {
      const req = makeRequest('GET', 'http://localhost:3000/api/forms/contact/submissions?page=1&perPage=10')
      const response = await handlers.handleListSubmissions(req, 'contact')
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.data.submissions).toHaveLength(2)
      expect(body.data.total).toBe(2)
      expect(body.data.page).toBe(1)
      expect(body.data.perPage).toBe(10)
    })

    it('returns 404 for non-existent form', async () => {
      const req = makeRequest('GET', 'http://localhost:3000/api/forms/nonexistent/submissions')
      const response = await handlers.handleListSubmissions(req, 'nonexistent')
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error.code).toBe('NOT_FOUND')
    })

    it('respects pagination parameters', async () => {
      const req = makeRequest('GET', 'http://localhost:3000/api/forms/contact/submissions?page=1&perPage=1')
      const response = await handlers.handleListSubmissions(req, 'contact')
      const body = await response.json()

      expect(body.data.submissions).toHaveLength(1)
      expect(body.data.total).toBe(2)
      expect(body.data.perPage).toBe(1)
    })

    it('defaults to page 1 and perPage 20', async () => {
      const req = makeRequest('GET', 'http://localhost:3000/api/forms/contact/submissions')
      const response = await handlers.handleListSubmissions(req, 'contact')
      const body = await response.json()

      expect(body.data.page).toBe(1)
      expect(body.data.perPage).toBe(20)
    })
  })

  describe('handleGetSubmission', () => {
    it('returns a single submission by ID', async () => {
      const req = makeRequest('GET', 'http://localhost:3000/api/forms/contact/submissions/abc123')
      const response = await handlers.handleGetSubmission(req, 'contact', 'abc123')
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.data.id).toBe('abc123')
      expect(body.data.data.name).toBe('Alice')
    })

    it('returns 404 for non-existent submission', async () => {
      const req = makeRequest('GET', 'http://localhost:3000/api/forms/contact/submissions/nonexistent')
      const response = await handlers.handleGetSubmission(req, 'contact', 'nonexistent')
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error.code).toBe('NOT_FOUND')
    })

    it('returns 404 for non-existent form', async () => {
      const req = makeRequest('GET', 'http://localhost:3000/api/forms/missing/submissions/abc123')
      const response = await handlers.handleGetSubmission(req, 'missing', 'abc123')
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error.code).toBe('NOT_FOUND')
    })
  })

  describe('handleDeleteSubmission', () => {
    it('deletes a submission and returns success', async () => {
      const req = makeRequest('DELETE', 'http://localhost:3000/api/forms/contact/submissions/abc123')
      const response = await handlers.handleDeleteSubmission(req, 'contact', 'abc123')
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.data.deleted).toBe(true)
    })

    it('returns 404 for non-existent submission', async () => {
      const req = makeRequest('DELETE', 'http://localhost:3000/api/forms/contact/submissions/nonexistent')
      const response = await handlers.handleDeleteSubmission(req, 'contact', 'nonexistent')
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error.code).toBe('NOT_FOUND')
    })
  })

  describe('handleExportCsv', () => {
    it('returns CSV with correct headers and content', async () => {
      const req = makeRequest('GET', 'http://localhost:3000/api/forms/contact/export/csv')
      const response = await handlers.handleExportCsv(req, 'contact')

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
      expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="contact-submissions.csv"')

      const csv = await response.text()
      expect(csv).toContain('id,submitted_at,')
      expect(csv).toContain('email')
      expect(csv).toContain('name')
    })

    it('returns 404 for non-existent form', async () => {
      const req = makeRequest('GET', 'http://localhost:3000/api/forms/missing/export/csv')
      const response = await handlers.handleExportCsv(req, 'missing')
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error.code).toBe('NOT_FOUND')
    })
  })

  describe('handleExportJson', () => {
    it('returns JSON array of all submissions', async () => {
      const req = makeRequest('GET', 'http://localhost:3000/api/forms/contact/export/json')
      const response = await handlers.handleExportJson(req, 'contact')

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8')
      expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="contact-submissions.json"')

      const json = JSON.parse(await response.text())
      expect(Array.isArray(json)).toBe(true)
      expect(json).toHaveLength(2)
    })

    it('returns 404 for non-existent form', async () => {
      const req = makeRequest('GET', 'http://localhost:3000/api/forms/missing/export/json')
      const response = await handlers.handleExportJson(req, 'missing')
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error.code).toBe('NOT_FOUND')
    })
  })
})
