import { describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createFormHandlers } from '@/app/(cp)/api/handlers/forms'
import { FormOperations } from '@/lib/content/forms'
import { BlueprintLoader } from '@/lib/blueprints/loader'
import { BlueprintRegistry } from '@/lib/blueprints/registry'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'
import { InMemoryContentCache } from '@/lib/cache/store'

/**
 * In-memory file system for testing form validation error handling.
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
    if (this.files.has(filePath)) return true
    for (const key of this.files.keys()) {
      if (key.startsWith(filePath + '/')) return true
    }
    return false
  }

  async listFiles(directory: string, pattern?: string): Promise<string[]> {
    const results: string[] = []
    const ext = pattern?.replace('*', '') ?? ''
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
    this.files.delete(src)
  }
}

/**
 * Simple YAML parser for testing purposes.
 */
const parser: ContentParser = {
  parseYaml<T>(content: string): T {
    const { parse } = require('yaml')
    return parse(content) as T
  },
  serializeYaml(data: unknown): string {
    const { stringify } = require('yaml')
    return stringify(data)
  },
  parseMarkdownFrontmatter<T>(content: string): { data: T; content: string } {
    return { data: {} as T, content }
  },
  serializeMarkdownFrontmatter(data: unknown, content: string): string {
    return content
  },
}

describe('Form Submission Validation Errors', () => {
  let fs: InMemoryFS
  let cache: InMemoryContentCache
  let formOps: FormOperations
  let blueprintRegistry: BlueprintRegistry
  let handlers: ReturnType<typeof createFormHandlers>

  const contentPath = '/content'
  const resourcesPath = '/resources'

  beforeEach(async () => {
    fs = new InMemoryFS()
    cache = new InMemoryContentCache()
    formOps = new FormOperations(fs, parser, cache, contentPath, resourcesPath)

    const blueprintLoader = new BlueprintLoader(fs, parser, resourcesPath)
    blueprintRegistry = new BlueprintRegistry(blueprintLoader)
    handlers = createFormHandlers(formOps, blueprintRegistry)

    // Set up a form blueprint with validation rules
    await fs.writeFile(
      '/resources/blueprints/forms/contact.yaml',
      `tabs:
  main:
    display: Form Fields
    fields:
      - handle: name
        field:
          type: text
          display: Full Name
          required: true
          validate:
            - required
            - min:2
            - max:100
      - handle: email
        field:
          type: text
          display: Email Address
          required: true
          validate:
            - required
            - email
      - handle: message
        field:
          type: text
          display: Message
          required: true
          validate:
            - required
            - min:10
`
    )
  })

  it('returns 422 with field-level errors when validation fails', async () => {
    const request = new NextRequest('http://localhost/api/forms/contact/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'A', // too short (min:2)
        email: 'not-an-email', // invalid email
        message: 'short', // too short (min:10)
      }),
    })

    const response = await handlers.handleSubmitForm(request, 'contact')
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toBe('Validation failed')
    expect(body.error.fields).toBeDefined()

    // name too short
    expect(body.error.fields.name).toBeDefined()
    expect(body.error.fields.name.length).toBeGreaterThan(0)

    // email invalid
    expect(body.error.fields.email).toBeDefined()
    expect(body.error.fields.email.length).toBeGreaterThan(0)

    // message too short
    expect(body.error.fields.message).toBeDefined()
    expect(body.error.fields.message.length).toBeGreaterThan(0)
  })

  it('returns 201 when all fields pass validation', async () => {
    const request = new NextRequest('http://localhost/api/forms/contact/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Jane Smith',
        email: 'jane@example.com',
        message: 'Hello, this is a valid message with enough characters.',
      }),
    })

    const response = await handlers.handleSubmitForm(request, 'contact')
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.data).toBeDefined()
    expect(body.data.form).toBe('contact')
    expect(body.data.data.name).toBe('Jane Smith')
  })

  it('returns errors keyed by field handle', async () => {
    const request = new NextRequest('http://localhost/api/forms/contact/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '', // empty, required
        email: '', // empty, required
        message: '', // empty, required
      }),
    })

    const response = await handlers.handleSubmitForm(request, 'contact')
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.error.fields).toHaveProperty('name')
    expect(body.error.fields).toHaveProperty('email')
    expect(body.error.fields).toHaveProperty('message')
  })

  it('returns only errors for fields that fail validation', async () => {
    const request = new NextRequest('http://localhost/api/forms/contact/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Valid Name',
        email: 'bad-email', // only this fails
        message: 'This is a long enough message for the minimum.',
      }),
    })

    const response = await handlers.handleSubmitForm(request, 'contact')
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.error.fields).not.toHaveProperty('name')
    expect(body.error.fields).toHaveProperty('email')
    expect(body.error.fields).not.toHaveProperty('message')
  })

  it('returns 404 when form does not exist', async () => {
    const request = new NextRequest('http://localhost/api/forms/nonexistent/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test' }),
    })

    const response = await handlers.handleSubmitForm(request, 'nonexistent')
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('NOT_FOUND')
  })
})
