import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import { InMemoryContentCache } from '@/lib/cache/store'
import { FormOperations } from '@/lib/content/forms'
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
  })
})
