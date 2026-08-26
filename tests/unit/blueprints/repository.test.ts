import * as path from 'path'
import { describe, expect, it } from 'vitest'
import { DefinitionRepository } from '@/lib/blueprints/repository'
import type { Blueprint, Fieldset } from '@/lib/blueprints/types'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import type { ContentMutation, ContentMutationReporter } from '@/lib/mutations'

class MemoryFileSystem implements FileSystemAdapter {
  readonly files = new Map<string, string>()
  readonly directories = new Set<string>()

  async readFile(filePath: string): Promise<string> {
    const value = this.files.get(filePath)
    if (value === undefined) throw new Error(`Missing file: ${filePath}`)
    return value
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    this.files.set(filePath, content)
    this.directories.add(path.dirname(filePath))
  }

  async deleteFile(filePath: string): Promise<void> {
    this.files.delete(filePath)
  }

  async exists(filePath: string): Promise<boolean> {
    if (this.files.has(filePath) || this.directories.has(filePath)) return true
    const prefix = `${filePath}${path.sep}`
    return [...this.files.keys()].some((candidate) => candidate.startsWith(prefix))
  }

  async listFiles(directory: string, pattern = '**/*'): Promise<string[]> {
    const prefix = `${directory}${path.sep}`
    return [...this.files.keys()]
      .filter((candidate) => candidate.startsWith(prefix))
      .map((candidate) => candidate.slice(prefix.length))
      .filter((candidate) => {
        if (pattern === '*.yaml') return !candidate.includes(path.sep) && candidate.endsWith('.yaml')
        if (pattern === '**/*.yaml') return candidate.endsWith('.yaml')
        return true
      })
      .sort()
  }

  async listDirectories(): Promise<string[]> { return [] }
  async mkdir(directory: string): Promise<void> { this.directories.add(directory) }
  async copyFile(source: string, destination: string): Promise<void> {
    await this.writeFile(destination, await this.readFile(source))
  }
  async moveFile(source: string, destination: string): Promise<void> {
    await this.writeFile(destination, await this.readFile(source))
    this.files.delete(source)
  }
}

class MutationRecorder implements ContentMutationReporter {
  readonly mutations: ContentMutation[] = []
  report(mutation: ContentMutation): void { this.mutations.push(mutation) }
  onMutation(): () => void { return () => undefined }
}

function createRepository() {
  const fs = new MemoryFileSystem()
  const mutations = new MutationRecorder()
  const repository = new DefinitionRepository(fs, new MarkdownYamlParser(), '/project/resources', mutations)
  return { fs, mutations, repository }
}

const seoFieldset: Fieldset = {
  handle: 'seo',
  display: 'SEO',
  is_block: false,
  fields: [
    { handle: 'meta_title', field: { type: 'text', validate: ['max:60'] } },
  ],
}

const articleBlueprint: Blueprint = {
  handle: 'article',
  tabs: {
    main: {
      fields: [
        { handle: 'title', field: { type: 'text', required: true } },
        { import: 'seo' },
      ] as Blueprint['tabs']['main']['fields'],
    },
  },
}

describe('DefinitionRepository interface', () => {
  it('owns Blueprint and Fieldset persistence, serialization, and resolution', async () => {
    const { repository, mutations } = createRepository()

    await repository.write({ kind: 'fieldset', handle: 'seo' }, seoFieldset)
    await repository.write(
      { kind: 'blueprint', type: 'collections', handle: 'article' },
      articleBlueprint
    )

    const stored = await repository.read({ kind: 'blueprint', type: 'collections', handle: 'article' })
    const resolved = await repository.read(
      { kind: 'blueprint', type: 'collections', handle: 'article' },
      { resolve: true }
    )

    expect(stored?.tabs.main.fields).toEqual(articleBlueprint.tabs.main.fields)
    expect(resolved?.tabs.main.fields.map((field) => field.handle)).toEqual(['title', 'meta_title'])
    expect(mutations.mutations.map((mutation) => mutation.resource.type)).toEqual(['fieldset', 'blueprint'])
  })

  it('lists both definition kinds through same lifecycle interface', async () => {
    const { repository } = createRepository()
    await repository.write({ kind: 'fieldset', handle: 'seo' }, seoFieldset)
    await repository.write({ kind: 'blueprint', type: 'collections', handle: 'article' }, articleBlueprint)

    await expect(repository.list({ kind: 'fieldset' })).resolves.toMatchObject([
      { handle: 'seo', display: 'SEO', is_block: false },
    ])
    await expect(repository.list({ kind: 'blueprint', type: 'collections' })).resolves.toMatchObject([
      { handle: 'article' },
    ])
  })

  it('rejects invalid definitions before atomic persistence', async () => {
    const { fs, repository } = createRepository()

    await expect(repository.write(
      { kind: 'fieldset', handle: 'broken' },
      { handle: 'broken', fields: [{ handle: 'title', field: { type: 'not-real' } }], is_block: false } as Fieldset
    )).rejects.toThrow('Invalid fieldset')

    expect(fs.files.size).toBe(0)
  })

  it('rejects unsafe Fieldset imports before persistence or path resolution', async () => {
    const { fs, repository } = createRepository()

    await expect(repository.write(
      { kind: 'fieldset', handle: 'unsafe' },
      { handle: 'unsafe', fields: [{ import: '../secrets' }], is_block: false }
    )).rejects.toThrow('Invalid fieldset')

    expect(fs.files.size).toBe(0)
  })

  it('protects referenced Fieldsets from deletion', async () => {
    const { fs, repository } = createRepository()
    await repository.write({ kind: 'fieldset', handle: 'seo' }, seoFieldset)
    await repository.write({ kind: 'blueprint', type: 'collections', handle: 'article' }, articleBlueprint)

    const result = await repository.remove({ kind: 'fieldset', handle: 'seo' })

    expect(result).toEqual({
      deleted: false,
      reason: 'referenced',
      references: ['/project/resources/blueprints/collections/article.yaml'],
    })
    expect(await fs.exists('/project/resources/fieldsets/seo.yaml')).toBe(true)
  })

  it('protects referenced Blueprints and deletes unreferenced definitions', async () => {
    const { fs, mutations, repository } = createRepository()
    await repository.write({ kind: 'blueprint', type: 'collections', handle: 'article' }, articleBlueprint)
    await fs.writeFile('/project/resources/collections/posts.yaml', 'title: Posts\nblueprint: article\n')

    await expect(repository.remove({ kind: 'blueprint', type: 'collections', handle: 'article' }))
      .resolves.toEqual({
        deleted: false,
        reason: 'referenced',
        references: ['/project/resources/collections/posts.yaml'],
      })

    await fs.deleteFile('/project/resources/collections/posts.yaml')
    await expect(repository.remove({ kind: 'blueprint', type: 'collections', handle: 'article' }))
      .resolves.toEqual({ deleted: true, references: [] })
    expect(mutations.mutations.at(-1)?.action).toBe('delete')
  })
})
