import * as fs from 'fs/promises'
import * as path from 'path'
import { glob } from 'glob'
import { UniversalFileParser, type FileFormat } from '@/lib/fs/parser'

export interface NavigationItem {
  [key: string]: unknown
  children?: NavigationItem[]
}

export interface NavigationData {
  items: NavigationItem[]
}

export interface ContentEntry {
  id: string
  data: Record<string, unknown>
  format: FileFormat
  path: string
}

export interface IContentStore {
  // Taxonomy terms
  listTerms(taxonomyHandle: string): Promise<ContentEntry[]>
  getTerm(taxonomyHandle: string, termSlug: string): Promise<ContentEntry | null>
  createTerm(taxonomyHandle: string, slug: string, data: Record<string, unknown>): Promise<ContentEntry>
  updateTerm(taxonomyHandle: string, slug: string, data: Record<string, unknown>): Promise<ContentEntry>
  deleteTerm(taxonomyHandle: string, slug: string): Promise<void>

  // Form submissions
  listSubmissions(formHandle: string): Promise<ContentEntry[]>
  getSubmission(formHandle: string, id: string): Promise<ContentEntry | null>
  createSubmission(formHandle: string, data: Record<string, unknown>): Promise<ContentEntry>
  deleteSubmission(formHandle: string, id: string): Promise<void>
}

export class ContentStore implements IContentStore {
  private parser: UniversalFileParser
  private contentPath: string

  constructor(contentPath: string = './content') {
    this.parser = new UniversalFileParser()
    this.contentPath = contentPath
  }

  // --- Globals ---

  /**
   * Get global data by handle.
   * Reads from content/globals/{handle}.yaml or .json.
   * Returns {} if file doesn't exist.
   */
  async getGlobal(handle: string): Promise<Record<string, unknown>> {
    const filePath = await this.resolveFile('globals', handle)
    if (!filePath) return {}

    const content = await fs.readFile(filePath, 'utf-8')
    return this.parser.parse<Record<string, unknown>>(filePath, content)
  }

  /**
   * Update global data by handle.
   * Preserves format if file exists, defaults to YAML for new files.
   */
  async updateGlobal(handle: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const existingPath = await this.resolveFile('globals', handle)
    let filePath: string
    let format: FileFormat

    if (existingPath) {
      filePath = existingPath
      format = this.parser.detectFormat(existingPath)
    } else {
      const dir = path.join(this.contentPath, 'globals')
      await fs.mkdir(dir, { recursive: true })
      filePath = path.join(dir, `${handle}.yaml`)
      format = 'yaml'
    }

    const content = this.parser.serialize(data, format)
    await fs.writeFile(filePath, content, 'utf-8')
    return data
  }

  // --- Navigation ---

  /**
   * Get navigation data by handle.
   * Reads from content/navigation/{handle}.yaml or .json.
   * Returns { items: [] } if file doesn't exist.
   */
  async getNavigation(handle: string): Promise<NavigationData> {
    const filePath = await this.resolveFile('navigation', handle)
    if (!filePath) return { items: [] }

    const content = await fs.readFile(filePath, 'utf-8')
    const parsed = this.parser.parse<NavigationData>(filePath, content)
    return parsed ?? { items: [] }
  }

  /**
   * Update navigation data by handle.
   * Preserves format if file exists, defaults to YAML for new files.
   */
  async updateNavigation(handle: string, data: NavigationData): Promise<NavigationData> {
    const existingPath = await this.resolveFile('navigation', handle)
    let filePath: string
    let format: FileFormat

    if (existingPath) {
      filePath = existingPath
      format = this.parser.detectFormat(existingPath)
    } else {
      const dir = path.join(this.contentPath, 'navigation')
      await fs.mkdir(dir, { recursive: true })
      filePath = path.join(dir, `${handle}.yaml`)
      format = 'yaml'
    }

    const content = this.parser.serialize(data, format)
    await fs.writeFile(filePath, content, 'utf-8')
    return data
  }

  // --- Taxonomy Terms ---

  async listTerms(taxonomyHandle: string): Promise<ContentEntry[]> {
    const dir = path.join(this.contentPath, 'taxonomies', taxonomyHandle)
    if (!(await this.directoryExists(dir))) return []

    const files = await glob('*.{yaml,yml,json}', { cwd: dir, nodir: true })
    const entries: ContentEntry[] = []

    for (const file of files) {
      const filePath = path.join(dir, file)
      const content = await fs.readFile(filePath, 'utf-8')
      const data = this.parser.parse<Record<string, unknown>>(filePath, content)
      const id = path.basename(file, path.extname(file))
      entries.push({ id, data, format: this.parser.detectFormat(filePath), path: filePath })
    }

    return entries
  }

  async getTerm(taxonomyHandle: string, termSlug: string): Promise<ContentEntry | null> {
    const filePath = await this.resolveFile(path.join('taxonomies', taxonomyHandle), termSlug)
    if (!filePath) return null

    const content = await fs.readFile(filePath, 'utf-8')
    const data = this.parser.parse<Record<string, unknown>>(filePath, content)
    return { id: termSlug, data, format: this.parser.detectFormat(filePath), path: filePath }
  }

  async createTerm(taxonomyHandle: string, slug: string, data: Record<string, unknown>): Promise<ContentEntry> {
    const dir = path.join(this.contentPath, 'taxonomies', taxonomyHandle)
    await fs.mkdir(dir, { recursive: true })

    const filePath = path.join(dir, `${slug}.yaml`)
    const content = this.parser.serialize(data, 'yaml')
    await fs.writeFile(filePath, content, 'utf-8')

    return { id: slug, data, format: 'yaml', path: filePath }
  }

  async updateTerm(taxonomyHandle: string, slug: string, data: Record<string, unknown>): Promise<ContentEntry> {
    const existingPath = await this.resolveFile(path.join('taxonomies', taxonomyHandle), slug)
    let filePath: string
    let format: FileFormat

    if (existingPath) {
      filePath = existingPath
      format = this.parser.detectFormat(existingPath)
    } else {
      const dir = path.join(this.contentPath, 'taxonomies', taxonomyHandle)
      await fs.mkdir(dir, { recursive: true })
      filePath = path.join(dir, `${slug}.yaml`)
      format = 'yaml'
    }

    const content = this.parser.serialize(data, format)
    await fs.writeFile(filePath, content, 'utf-8')
    return { id: slug, data, format, path: filePath }
  }

  async deleteTerm(taxonomyHandle: string, slug: string): Promise<void> {
    const filePath = await this.resolveFile(path.join('taxonomies', taxonomyHandle), slug)
    if (filePath) {
      await fs.unlink(filePath)
    }
  }

  // --- Form Submissions ---

  async listSubmissions(formHandle: string): Promise<ContentEntry[]> {
    const dir = path.join(this.contentPath, 'forms', formHandle)
    if (!(await this.directoryExists(dir))) return []

    const files = await glob('*.{yaml,yml,json}', { cwd: dir, nodir: true })
    const entries: ContentEntry[] = []

    for (const file of files) {
      const filePath = path.join(dir, file)
      const content = await fs.readFile(filePath, 'utf-8')
      const data = this.parser.parse<Record<string, unknown>>(filePath, content)
      const id = path.basename(file, path.extname(file))
      entries.push({ id, data, format: this.parser.detectFormat(filePath), path: filePath })
    }

    return entries
  }

  async getSubmission(formHandle: string, id: string): Promise<ContentEntry | null> {
    const filePath = await this.resolveFile(path.join('forms', formHandle), id)
    if (!filePath) return null

    const content = await fs.readFile(filePath, 'utf-8')
    const data = this.parser.parse<Record<string, unknown>>(filePath, content)
    return { id, data, format: this.parser.detectFormat(filePath), path: filePath }
  }

  async createSubmission(formHandle: string, data: Record<string, unknown>): Promise<ContentEntry> {
    const dir = path.join(this.contentPath, 'forms', formHandle)
    await fs.mkdir(dir, { recursive: true })

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    const filePath = path.join(dir, `${id}.yaml`)
    const content = this.parser.serialize(data, 'yaml')
    await fs.writeFile(filePath, content, 'utf-8')

    return { id, data, format: 'yaml', path: filePath }
  }

  async deleteSubmission(formHandle: string, id: string): Promise<void> {
    const filePath = await this.resolveFile(path.join('forms', formHandle), id)
    if (filePath) {
      await fs.unlink(filePath)
    }
  }

  // --- Private Helpers ---

  /**
   * Resolve a file by checking for .yaml, .yml, and .json extensions.
   * Returns the full path if found, null otherwise.
   */
  private async resolveFile(subdir: string, handle: string): Promise<string | null> {
    const dir = path.join(this.contentPath, subdir)
    const extensions = ['.yaml', '.yml', '.json']

    for (const ext of extensions) {
      const filePath = path.join(dir, `${handle}${ext}`)
      if (await this.fileExists(filePath)) {
        return filePath
      }
    }

    return null
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath)
      return stat.isDirectory()
    } catch {
      return false
    }
  }
}
