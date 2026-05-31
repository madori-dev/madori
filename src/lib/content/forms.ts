import * as path from 'path'
import { randomUUID } from 'crypto'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'
import type { ContentCache } from '@/lib/cache/store'
import type { Form, FormSubmission } from '@/lib/types'
import { NotFoundError } from '@/lib/errors'

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

  async submitForm(handle: string, data: Record<string, unknown>): Promise<FormSubmission> {
    // Verify form exists
    const form = await this.getForm(handle)
    if (!form) {
      throw new NotFoundError('Form', handle)
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
}
