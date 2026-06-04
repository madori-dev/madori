import * as path from 'path'
import { randomUUID } from 'crypto'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'
import type { ContentCache } from '@/lib/cache/store'
import type { Form, FormSubmission } from '@/lib/types'
import { NotFoundError } from '@/lib/errors'

export interface SubmissionListOptions {
  page: number
  perPage: number
  sort?: 'newest' | 'oldest'
}

export interface SubmissionListResult {
  submissions: FormSubmission[]
  total: number
  page: number
  perPage: number
}

/**
 * Checks whether a honeypot field has been filled in (indicating a bot submission).
 * Returns true if the honeypot field is present and non-empty.
 */
export function isHoneypotFilled(data: Record<string, unknown>, honeypotField: string): boolean {
  return data[honeypotField] !== undefined && data[honeypotField] !== ''
}

export class FormOperations {
  constructor(
    private readonly fs: FileSystemAdapter,
    private readonly parser: ContentParser,
    private readonly cache: ContentCache,
    private readonly contentPath: string,
    private readonly resourcesPath: string
  ) {}

  private get formsDir(): string {
    return path.join(this.contentPath, 'forms')
  }

  private get formBlueprintsDir(): string {
    return path.join(this.resourcesPath, 'blueprints', 'forms')
  }

  private get formDefinitionsDir(): string {
    return path.join(this.resourcesPath, 'forms')
  }

  private cacheKey(handle: string): string {
    return `form:${handle}`
  }

  async getForm(handle: string): Promise<Form | null> {
    const cached = this.cache.get<Form>(this.cacheKey(handle))
    if (cached) return cached

    const filePath = path.join(this.formBlueprintsDir, `${handle}.yaml`)
    const fileExists = await this.fs.exists(filePath)
    if (!fileExists) return null

    const raw = await this.fs.readFile(filePath)
    const data = this.parser.parseYaml<Record<string, unknown>>(raw)

    const form: Form = {
      handle: typeof data.handle === 'string' ? data.handle : handle,
      display: typeof data.display === 'string' ? data.display : handle,
      fields: Array.isArray(data.fields) ? data.fields : [],
    }

    this.cache.set(this.cacheKey(handle), form, [filePath])
    return form
  }

  /**
   * Load the form definition (title, honeypot, store_submissions) from resources/forms/{handle}.yaml.
   */
  private async getFormDefinition(handle: string): Promise<Record<string, unknown> | null> {
    const filePath = path.join(this.formDefinitionsDir, `${handle}.yaml`)
    const fileExists = await this.fs.exists(filePath)
    if (!fileExists) return null

    const raw = await this.fs.readFile(filePath)
    return this.parser.parseYaml<Record<string, unknown>>(raw)
  }

  async listForms(): Promise<Form[]> {
    const cached = this.cache.get<Form[]>('forms:list')
    if (cached) return cached

    const dirExists = await this.fs.exists(this.formBlueprintsDir)
    if (!dirExists) return []

    const files = await this.fs.listFiles(this.formBlueprintsDir, '*.yaml')
    const forms: Form[] = []

    for (const file of files) {
      const handle = path.basename(file, '.yaml')
      const form = await this.getForm(handle)
      if (form) forms.push(form)
    }

    this.cache.set('forms:list', forms, [this.formBlueprintsDir])
    return forms
  }

  async submitForm(handle: string, data: Record<string, unknown>): Promise<FormSubmission | null> {
    // Verify form exists (blueprint)
    const form = await this.getForm(handle)
    if (!form) {
      throw new NotFoundError('Form', handle)
    }

    // Check honeypot: if the form definition has honeypot enabled and the
    // honeypot field is filled, silently discard the submission.
    const definition = await this.getFormDefinition(handle)
    if (definition?.honeypot === true) {
      const honeypotField = '_honeypot'
      if (isHoneypotFilled(data, honeypotField)) {
        // Silently discard — return null to indicate discarded submission
        return null
      }
      // Remove the honeypot field from submission data before storage
      const { [honeypotField]: _removed, ...cleanData } = data
      data = cleanData
    }

    const id = randomUUID()
    const submittedAt = new Date().toISOString()
    const timestamp = submittedAt.replace(/[:.]/g, '-').slice(0, 19)

    const submission: FormSubmission = {
      id,
      form: handle,
      submittedAt,
      data,
    }

    const submissionDir = path.join(this.formsDir, handle)
    const filePath = path.join(submissionDir, `${timestamp}-${id}.yaml`)

    const yamlData = {
      id: submission.id,
      form: submission.form,
      submitted_at: submission.submittedAt,
      data: submission.data,
    }

    const yaml = this.parser.serializeYaml(yamlData)
    await this.fs.writeFile(filePath, yaml)

    return submission
  }

  /**
   * List submissions for a form with pagination and sorting.
   */
  async listSubmissions(handle: string, options: SubmissionListOptions): Promise<SubmissionListResult> {
    const submissionDir = path.join(this.formsDir, handle)
    const dirExists = await this.fs.exists(submissionDir)

    if (!dirExists) {
      return { submissions: [], total: 0, page: options.page, perPage: options.perPage }
    }

    const files = await this.fs.listFiles(submissionDir, '*.yaml')
    const submissions: FormSubmission[] = []

    for (const file of files) {
      const filePath = path.join(submissionDir, file)
      const raw = await this.fs.readFile(filePath)
      const parsed = this.parser.parseYaml<Record<string, unknown>>(raw)
      submissions.push({
        id: String(parsed.id ?? ''),
        form: String(parsed.form ?? handle),
        submittedAt: String(parsed.submitted_at ?? ''),
        data: (parsed.data as Record<string, unknown>) ?? {},
      })
    }

    // Sort submissions
    const sort = options.sort ?? 'newest'
    submissions.sort((a, b) => {
      const comparison = a.submittedAt.localeCompare(b.submittedAt)
      return sort === 'newest' ? -comparison : comparison
    })

    const total = submissions.length
    const start = (options.page - 1) * options.perPage
    const paged = submissions.slice(start, start + options.perPage)

    return { submissions: paged, total, page: options.page, perPage: options.perPage }
  }

  /**
   * Get a single submission by ID.
   */
  async getSubmission(handle: string, id: string): Promise<FormSubmission | null> {
    const submissionDir = path.join(this.formsDir, handle)
    const dirExists = await this.fs.exists(submissionDir)
    if (!dirExists) return null

    const files = await this.fs.listFiles(submissionDir, '*.yaml')
    const match = files.find((f) => f.includes(id))
    if (!match) return null

    const filePath = path.join(submissionDir, match)
    const raw = await this.fs.readFile(filePath)
    const parsed = this.parser.parseYaml<Record<string, unknown>>(raw)

    return {
      id: String(parsed.id ?? ''),
      form: String(parsed.form ?? handle),
      submittedAt: String(parsed.submitted_at ?? ''),
      data: (parsed.data as Record<string, unknown>) ?? {},
    }
  }

  /**
   * Delete a submission by ID.
   */
  async deleteSubmission(handle: string, id: string): Promise<void> {
    const submissionDir = path.join(this.formsDir, handle)
    const dirExists = await this.fs.exists(submissionDir)
    if (!dirExists) {
      throw new NotFoundError('Submission', id)
    }

    const files = await this.fs.listFiles(submissionDir, '*.yaml')
    const match = files.find((f) => f.includes(id))
    if (!match) {
      throw new NotFoundError('Submission', id)
    }

    const filePath = path.join(submissionDir, match)
    await this.fs.deleteFile(filePath)
  }

  /**
   * Export all submissions for a form as CSV.
   * Headers are the superset of all field handles across all submissions.
   */
  async exportCsv(handle: string): Promise<string> {
    const submissionDir = path.join(this.formsDir, handle)
    const dirExists = await this.fs.exists(submissionDir)

    if (!dirExists) {
      return ''
    }

    const files = await this.fs.listFiles(submissionDir, '*.yaml')
    const submissions: FormSubmission[] = []

    for (const file of files) {
      const filePath = path.join(submissionDir, file)
      const raw = await this.fs.readFile(filePath)
      const parsed = this.parser.parseYaml<Record<string, unknown>>(raw)
      submissions.push({
        id: String(parsed.id ?? ''),
        form: String(parsed.form ?? handle),
        submittedAt: String(parsed.submitted_at ?? ''),
        data: (parsed.data as Record<string, unknown>) ?? {},
      })
    }

    if (submissions.length === 0) {
      return ''
    }

    // Build superset of all field handles
    const fieldHandles = new Set<string>()
    for (const sub of submissions) {
      for (const key of Object.keys(sub.data)) {
        fieldHandles.add(key)
      }
    }

    const headers = ['id', 'submitted_at', ...Array.from(fieldHandles).sort()]
    const rows: string[] = [headers.join(',')]

    for (const sub of submissions) {
      const row = headers.map((header) => {
        if (header === 'id') return escapeCsvField(sub.id)
        if (header === 'submitted_at') return escapeCsvField(sub.submittedAt)
        const value = sub.data[header]
        return escapeCsvField(value !== undefined && value !== null ? String(value) : '')
      })
      rows.push(row.join(','))
    }

    return rows.join('\n')
  }

  /**
   * Export all submissions for a form as JSON.
   * Returns a JSON array of all submissions.
   */
  async exportJson(handle: string): Promise<string> {
    const submissionDir = path.join(this.formsDir, handle)
    const dirExists = await this.fs.exists(submissionDir)

    if (!dirExists) {
      return '[]'
    }

    const files = await this.fs.listFiles(submissionDir, '*.yaml')
    const submissions: FormSubmission[] = []

    for (const file of files) {
      const filePath = path.join(submissionDir, file)
      const raw = await this.fs.readFile(filePath)
      const parsed = this.parser.parseYaml<Record<string, unknown>>(raw)
      submissions.push({
        id: String(parsed.id ?? ''),
        form: String(parsed.form ?? handle),
        submittedAt: String(parsed.submitted_at ?? ''),
        data: (parsed.data as Record<string, unknown>) ?? {},
      })
    }

    return JSON.stringify(submissions, null, 2)
  }
}

/**
 * Escape a value for CSV output. Wraps in quotes if the value contains
 * commas, quotes, or newlines.
 */
function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
