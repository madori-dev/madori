import { describe, expect, it } from 'vitest'
import { FormOperations } from '../forms'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import { InMemoryContentCache } from '@/lib/cache/store'
import type { FileSystemAdapter } from '@/lib/fs/adapter'

class MemoryFileSystem implements FileSystemAdapter {
  readonly files = new Map<string, string>()

  async readFile(filePath: string): Promise<string> {
    const value = this.files.get(filePath)
    if (value === undefined) throw new Error(`Missing file: ${filePath}`)
    return value
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    this.files.set(filePath, content)
  }

  async deleteFile(filePath: string): Promise<void> {
    this.files.delete(filePath)
  }

  async exists(filePath: string): Promise<boolean> {
    return this.files.has(filePath) || [...this.files.keys()].some((file) => file.startsWith(`${filePath}/`))
  }

  async listFiles(directory: string, pattern?: string): Promise<string[]> {
    const suffix = pattern === '*.yaml' ? '.yaml' : ''
    return [...this.files.keys()]
      .filter((file) => file.startsWith(`${directory}/`) && file.slice(directory.length + 1).includes('/') === false)
      .map((file) => file.slice(directory.length + 1))
      .filter((file) => file.endsWith(suffix))
      .sort()
  }

  async listDirectories(): Promise<string[]> { return [] }
  async mkdir(): Promise<void> {}
  async copyFile(src: string, dest: string): Promise<void> { this.files.set(dest, await this.readFile(src)) }
  async moveFile(src: string, dest: string): Promise<void> {
    this.files.set(dest, await this.readFile(src))
    this.files.delete(src)
  }
}

describe('FormOperations', () => {
  it('does not persist a submission when store_submissions is disabled', async () => {
    const fs = new MemoryFileSystem()
    fs.files.set('/resources/blueprints/forms/contact.yaml', 'handle: contact\ndisplay: Contact\nfields: []\n')
    fs.files.set('/resources/forms/contact.yaml', 'store_submissions: false\n')
    const forms = new FormOperations(fs, new MarkdownYamlParser(), new InMemoryContentCache(), '/content', '/resources')

    const submission = await forms.submitForm('contact', { email: 'person@example.com' })

    expect(submission).toMatchObject({ form: 'contact', data: { email: 'person@example.com' } })
    expect([...fs.files.keys()].filter((file) => file.startsWith('/content/forms/contact/'))).toEqual([])
  })
})
