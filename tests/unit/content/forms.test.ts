import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import { InMemoryContentCache } from '@/lib/cache/store'
import { FormOperations, isHoneypotFilled } from '@/lib/content/forms'
import { NotFoundError } from '@/lib/errors'

describe('FormOperations', () => {
  let forms: FormOperations
  let cache: InMemoryContentCache
  let tmpDir: string
  let resourcesDir: string

  beforeEach(async () => {
    tmpDir = path.join(process.cwd(), 'tests', '.tmp', `forms-${Date.now()}`)
    resourcesDir = path.join(tmpDir, 'resources')
    const formsDir = path.join(tmpDir, 'content', 'forms')
    const blueprintsDir = path.join(resourcesDir, 'blueprints', 'forms')
    await fs.mkdir(formsDir, { recursive: true })
    await fs.mkdir(blueprintsDir, { recursive: true })

    const adapter = new NodeFileSystemAdapter()
    const parser = new MarkdownYamlParser()
    cache = new InMemoryContentCache()
    forms = new FormOperations(adapter, parser, cache, path.join(tmpDir, 'content'), resourcesDir)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('getForm', () => {
    it('returns null for non-existent form', async () => {
      const result = await forms.getForm('nonexistent')
      expect(result).toBeNull()
    })

    it('reads and parses a form blueprint YAML file', async () => {
      const yaml = `handle: contact
display: Contact Form
fields:
  - handle: name
    field:
      type: text
      required: true
  - handle: email
    field:
      type: text
      required: true
`
      await fs.writeFile(path.join(resourcesDir, 'blueprints', 'forms', 'contact.yaml'), yaml)

      const result = await forms.getForm('contact')
      expect(result).not.toBeNull()
      expect(result!.handle).toBe('contact')
      expect(result!.display).toBe('Contact Form')
      expect(result!.fields).toHaveLength(2)
    })

    it('uses handle as fallback for display', async () => {
      const yaml = `fields:\n  - handle: name\n    field:\n      type: text\n`
      await fs.writeFile(path.join(resourcesDir, 'blueprints', 'forms', 'simple.yaml'), yaml)

      const result = await forms.getForm('simple')
      expect(result!.handle).toBe('simple')
      expect(result!.display).toBe('simple')
    })

    it('returns cached result on second call', async () => {
      const yaml = `handle: contact\ndisplay: Contact\nfields: []\n`
      await fs.writeFile(path.join(resourcesDir, 'blueprints', 'forms', 'contact.yaml'), yaml)

      const first = await forms.getForm('contact')
      await fs.writeFile(path.join(resourcesDir, 'blueprints', 'forms', 'contact.yaml'), `handle: contact\ndisplay: Changed\nfields: []\n`)
      const second = await forms.getForm('contact')

      expect(second).toEqual(first)
    })
  })

  describe('listForms', () => {
    it('returns empty array when no forms exist', async () => {
      const result = await forms.listForms()
      expect(result).toEqual([])
    })

    it('lists all form blueprint YAML files', async () => {
      await fs.writeFile(
        path.join(resourcesDir, 'blueprints', 'forms', 'contact.yaml'),
        `handle: contact\ndisplay: Contact Form\nfields: []\n`
      )
      await fs.writeFile(
        path.join(resourcesDir, 'blueprints', 'forms', 'newsletter.yaml'),
        `handle: newsletter\ndisplay: Newsletter Signup\nfields: []\n`
      )

      const result = await forms.listForms()
      expect(result).toHaveLength(2)
      const handles = result.map((f) => f.handle).sort()
      expect(handles).toEqual(['contact', 'newsletter'])
    })
  })

  describe('submitForm', () => {
    it('throws NotFoundError for non-existent form', async () => {
      await expect(forms.submitForm('nonexistent', { name: 'Test' })).rejects.toThrow(NotFoundError)
    })

    it('creates a submission YAML file', async () => {
      const yaml = `handle: contact\ndisplay: Contact Form\nfields: []\n`
      await fs.writeFile(path.join(resourcesDir, 'blueprints', 'forms', 'contact.yaml'), yaml)

      const submission = await forms.submitForm('contact', { name: 'Jane', email: 'jane@example.com' })

      expect(submission.id).toBeTruthy()
      expect(submission.form).toBe('contact')
      expect(submission.submittedAt).toBeTruthy()
      expect(submission.data).toEqual({ name: 'Jane', email: 'jane@example.com' })

      // Verify file was written
      const submissionDir = path.join(tmpDir, 'content', 'forms', 'contact')
      const files = await fs.readdir(submissionDir)
      expect(files).toHaveLength(1)
      expect(files[0]).toContain(submission.id)
      expect(files[0]).toMatch(/\.yaml$/)
    })

    it('generates unique IDs for each submission', async () => {
      const yaml = `handle: contact\ndisplay: Contact Form\nfields: []\n`
      await fs.writeFile(path.join(resourcesDir, 'blueprints', 'forms', 'contact.yaml'), yaml)

      const sub1 = await forms.submitForm('contact', { name: 'First' })
      const sub2 = await forms.submitForm('contact', { name: 'Second' })

      expect(sub1.id).not.toBe(sub2.id)
    })

    it('stores submission data correctly in YAML', async () => {
      const yaml = `handle: contact\ndisplay: Contact Form\nfields: []\n`
      await fs.writeFile(path.join(resourcesDir, 'blueprints', 'forms', 'contact.yaml'), yaml)

      const submission = await forms.submitForm('contact', { message: 'Hello world' })

      const submissionDir = path.join(tmpDir, 'content', 'forms', 'contact')
      const files = await fs.readdir(submissionDir)
      const raw = await fs.readFile(path.join(submissionDir, files[0]), 'utf-8')

      expect(raw).toContain('form: contact')
      expect(raw).toContain('message: Hello world')
      expect(raw).toContain(submission.id)
    })

    it('silently discards submission when honeypot is filled', async () => {
      const blueprintYaml = `handle: contact\ndisplay: Contact Form\nfields: []\n`
      await fs.writeFile(path.join(resourcesDir, 'blueprints', 'forms', 'contact.yaml'), blueprintYaml)

      // Create form definition with honeypot enabled
      const defDir = path.join(resourcesDir, 'forms')
      await fs.mkdir(defDir, { recursive: true })
      await fs.writeFile(path.join(defDir, 'contact.yaml'), `title: Contact\nhoneypot: true\n`)

      const result = await forms.submitForm('contact', { name: 'Bot', _honeypot: 'filled' })
      expect(result).toBeNull()

      // Verify no file was written
      const submissionDir = path.join(tmpDir, 'content', 'forms', 'contact')
      const dirExists = await fs.access(submissionDir).then(() => true).catch(() => false)
      expect(dirExists).toBe(false)
    })

    it('stores submission normally when honeypot is empty', async () => {
      const blueprintYaml = `handle: contact\ndisplay: Contact Form\nfields: []\n`
      await fs.writeFile(path.join(resourcesDir, 'blueprints', 'forms', 'contact.yaml'), blueprintYaml)

      const defDir = path.join(resourcesDir, 'forms')
      await fs.mkdir(defDir, { recursive: true })
      await fs.writeFile(path.join(defDir, 'contact.yaml'), `title: Contact\nhoneypot: true\n`)

      const result = await forms.submitForm('contact', { name: 'Human', _honeypot: '' })
      expect(result).not.toBeNull()
      expect(result!.data.name).toBe('Human')
      // honeypot field should be stripped from stored data
      expect(result!.data._honeypot).toBeUndefined()
    })
  })

  describe('listSubmissions', () => {
    it('returns empty result when no submissions directory exists', async () => {
      const result = await forms.listSubmissions('contact', { page: 1, perPage: 10 })
      expect(result.submissions).toEqual([])
      expect(result.total).toBe(0)
    })

    it('returns paginated submissions sorted newest first by default', async () => {
      const blueprintYaml = `handle: contact\ndisplay: Contact Form\nfields: []\n`
      await fs.writeFile(path.join(resourcesDir, 'blueprints', 'forms', 'contact.yaml'), blueprintYaml)

      // Create 3 submissions
      await forms.submitForm('contact', { name: 'First' })
      await forms.submitForm('contact', { name: 'Second' })
      await forms.submitForm('contact', { name: 'Third' })

      const result = await forms.listSubmissions('contact', { page: 1, perPage: 2 })
      expect(result.total).toBe(3)
      expect(result.submissions).toHaveLength(2)
      expect(result.page).toBe(1)
      expect(result.perPage).toBe(2)
    })

    it('supports page 2', async () => {
      const blueprintYaml = `handle: contact\ndisplay: Contact Form\nfields: []\n`
      await fs.writeFile(path.join(resourcesDir, 'blueprints', 'forms', 'contact.yaml'), blueprintYaml)

      await forms.submitForm('contact', { name: 'First' })
      await forms.submitForm('contact', { name: 'Second' })
      await forms.submitForm('contact', { name: 'Third' })

      const result = await forms.listSubmissions('contact', { page: 2, perPage: 2 })
      expect(result.submissions).toHaveLength(1)
    })
  })

  describe('getSubmission', () => {
    it('returns null for non-existent submission', async () => {
      const result = await forms.getSubmission('contact', 'nonexistent-id')
      expect(result).toBeNull()
    })

    it('retrieves a previously submitted form entry', async () => {
      const blueprintYaml = `handle: contact\ndisplay: Contact Form\nfields: []\n`
      await fs.writeFile(path.join(resourcesDir, 'blueprints', 'forms', 'contact.yaml'), blueprintYaml)

      const submission = await forms.submitForm('contact', { name: 'Jane', email: 'jane@example.com' })
      const result = await forms.getSubmission('contact', submission!.id)

      expect(result).not.toBeNull()
      expect(result!.id).toBe(submission!.id)
      expect(result!.data).toEqual({ name: 'Jane', email: 'jane@example.com' })
    })
  })

  describe('deleteSubmission', () => {
    it('throws NotFoundError for non-existent submission', async () => {
      await expect(forms.deleteSubmission('contact', 'nonexistent')).rejects.toThrow(NotFoundError)
    })

    it('removes a submission file', async () => {
      const blueprintYaml = `handle: contact\ndisplay: Contact Form\nfields: []\n`
      await fs.writeFile(path.join(resourcesDir, 'blueprints', 'forms', 'contact.yaml'), blueprintYaml)

      const submission = await forms.submitForm('contact', { name: 'ToDelete' })
      await forms.deleteSubmission('contact', submission!.id)

      const result = await forms.getSubmission('contact', submission!.id)
      expect(result).toBeNull()
    })
  })

  describe('exportCsv', () => {
    it('returns empty string when no submissions exist', async () => {
      const result = await forms.exportCsv('contact')
      expect(result).toBe('')
    })

    it('generates CSV with headers as superset of all field handles', async () => {
      const blueprintYaml = `handle: contact\ndisplay: Contact Form\nfields: []\n`
      await fs.writeFile(path.join(resourcesDir, 'blueprints', 'forms', 'contact.yaml'), blueprintYaml)

      await forms.submitForm('contact', { name: 'Jane', email: 'jane@example.com' })
      await forms.submitForm('contact', { name: 'Bob', phone: '123' })

      const csv = await forms.exportCsv('contact')
      const lines = csv.split('\n')

      // Header should contain id, submitted_at, and all unique field handles
      expect(lines[0]).toContain('id')
      expect(lines[0]).toContain('submitted_at')
      expect(lines[0]).toContain('name')
      expect(lines[0]).toContain('email')
      expect(lines[0]).toContain('phone')

      // Should have header + 2 data rows
      expect(lines).toHaveLength(3)
    })
  })

  describe('exportJson', () => {
    it('returns empty array when no submissions exist', async () => {
      const result = await forms.exportJson('contact')
      expect(result).toBe('[]')
    })

    it('returns JSON array with all submissions', async () => {
      const blueprintYaml = `handle: contact\ndisplay: Contact Form\nfields: []\n`
      await fs.writeFile(path.join(resourcesDir, 'blueprints', 'forms', 'contact.yaml'), blueprintYaml)

      await forms.submitForm('contact', { name: 'Jane' })
      await forms.submitForm('contact', { name: 'Bob' })

      const json = await forms.exportJson('contact')
      const parsed = JSON.parse(json)

      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed).toHaveLength(2)
      expect(parsed[0].data.name).toBeDefined()
      expect(parsed[1].data.name).toBeDefined()
    })
  })
})

describe('isHoneypotFilled', () => {
  it('returns true when honeypot field has a value', () => {
    expect(isHoneypotFilled({ _honeypot: 'spam' }, '_honeypot')).toBe(true)
  })

  it('returns false when honeypot field is empty string', () => {
    expect(isHoneypotFilled({ _honeypot: '' }, '_honeypot')).toBe(false)
  })

  it('returns false when honeypot field is undefined', () => {
    expect(isHoneypotFilled({}, '_honeypot')).toBe(false)
  })
})
