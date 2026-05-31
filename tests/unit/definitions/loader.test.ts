import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { DefinitionLoader } from '@/lib/definitions/loader'
import {
  DefinitionParseError,
  DefinitionValidationError,
  DefinitionNotFoundError,
} from '@/lib/definitions/errors'

describe('DefinitionLoader', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-loader-test-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function writeDefinition(entityType: string, handle: string, content: string, ext = '.yaml') {
    const dir = path.join(tmpDir, entityType)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, `${handle}${ext}`), content)
  }

  describe('discover', () => {
    it('returns empty map when no files exist', async () => {
      const loader = new DefinitionLoader(tmpDir)
      const result = await loader.discover('taxonomies')
      expect(result.size).toBe(0)
    })

    it('discovers YAML files and derives handles', async () => {
      await writeDefinition('taxonomies', 'tags', 'title: Tags\n')
      await writeDefinition('taxonomies', 'categories', 'title: Categories\n')

      const loader = new DefinitionLoader(tmpDir)
      const result = await loader.discover('taxonomies')

      expect(result.size).toBe(2)
      expect(result.has('tags')).toBe(true)
      expect(result.has('categories')).toBe(true)
      expect(result.get('tags')!.format).toBe('yaml')
    })

    it('discovers JSON files', async () => {
      await writeDefinition('globals', 'site', '{"title": "Site"}', '.json')

      const loader = new DefinitionLoader(tmpDir)
      const result = await loader.discover('globals')

      expect(result.size).toBe(1)
      expect(result.get('site')!.format).toBe('json')
    })

    it('discovers .yml extension files', async () => {
      await writeDefinition('forms', 'contact', 'title: Contact\n', '.yml')

      const loader = new DefinitionLoader(tmpDir)
      const result = await loader.discover('forms')

      expect(result.size).toBe(1)
      expect(result.get('contact')!.format).toBe('yaml')
    })
  })

  describe('load', () => {
    it('loads and validates a YAML definition', async () => {
      await writeDefinition('taxonomies', 'tags', 'title: Tags\nblueprint: tag_fields\n')

      const loader = new DefinitionLoader(tmpDir)
      const result = await loader.load<{ title: string; blueprint: string }>('taxonomies', 'tags')

      expect(result.title).toBe('Tags')
      expect(result.blueprint).toBe('tag_fields')
    })

    it('loads and validates a JSON definition', async () => {
      await writeDefinition('navigations', 'main', JSON.stringify({ title: 'Main Nav', max_depth: 3 }), '.json')

      const loader = new DefinitionLoader(tmpDir)
      const result = await loader.load<{ title: string; max_depth: number }>('navigations', 'main')

      expect(result.title).toBe('Main Nav')
      expect(result.max_depth).toBe(3)
    })

    it('throws DefinitionNotFoundError for missing handle', async () => {
      const loader = new DefinitionLoader(tmpDir)
      await expect(loader.load('taxonomies', 'nonexistent')).rejects.toThrow(DefinitionNotFoundError)
    })

    it('throws DefinitionParseError for invalid YAML', async () => {
      await writeDefinition('taxonomies', 'bad', ':\n  : invalid: yaml: {{{\n')

      const loader = new DefinitionLoader(tmpDir)
      await expect(loader.load('taxonomies', 'bad')).rejects.toThrow(DefinitionParseError)
    })

    it('throws DefinitionValidationError when required field missing', async () => {
      await writeDefinition('taxonomies', 'notitle', 'blueprint: something\n')

      const loader = new DefinitionLoader(tmpDir)
      await expect(loader.load('taxonomies', 'notitle')).rejects.toThrow(DefinitionValidationError)
    })
  })

  describe('loadAll', () => {
    it('loads all definitions for an entity type', async () => {
      await writeDefinition('globals', 'site', 'title: Site Settings\n')
      await writeDefinition('globals', 'seo', 'title: SEO Settings\n')

      const loader = new DefinitionLoader(tmpDir)
      const result = await loader.loadAll<{ title: string }>('globals')

      expect(result.size).toBe(2)
      expect(result.get('site')!.title).toBe('Site Settings')
      expect(result.get('seo')!.title).toBe('SEO Settings')
    })

    it('returns empty map when directory is empty', async () => {
      const loader = new DefinitionLoader(tmpDir)
      const result = await loader.loadAll<unknown>('forms')
      expect(result.size).toBe(0)
    })
  })

  describe('create', () => {
    it('creates a YAML definition file at the correct path', async () => {
      const loader = new DefinitionLoader(tmpDir)
      await loader.create('taxonomies', 'tags', { title: 'Tags' })

      const filePath = path.join(tmpDir, 'taxonomies', 'tags.yaml')
      const content = await fs.readFile(filePath, 'utf-8')
      expect(content).toContain('title: Tags')
    })

    it('creates the directory if it does not exist', async () => {
      const loader = new DefinitionLoader(tmpDir)
      await loader.create('forms', 'contact', { title: 'Contact Form' })

      const filePath = path.join(tmpDir, 'forms', 'contact.yaml')
      const stat = await fs.stat(filePath)
      expect(stat.isFile()).toBe(true)
    })

    it('throws DefinitionValidationError when data is invalid', async () => {
      const loader = new DefinitionLoader(tmpDir)
      await expect(loader.create('taxonomies', 'bad', { blueprint: 'no_title' }))
        .rejects.toThrow(DefinitionValidationError)
    })

    it('created definition is readable via load', async () => {
      const loader = new DefinitionLoader(tmpDir)
      await loader.create('globals', 'site', { title: 'Site Settings', blueprint: 'main' })

      const result = await loader.load<{ title: string; blueprint: string }>('globals', 'site')
      expect(result.title).toBe('Site Settings')
      expect(result.blueprint).toBe('main')
    })
  })

  describe('update', () => {
    it('updates an existing YAML file preserving format', async () => {
      await writeDefinition('taxonomies', 'tags', 'title: Tags\n')

      const loader = new DefinitionLoader(tmpDir)
      await loader.update('taxonomies', 'tags', { title: 'Updated Tags' })

      const filePath = path.join(tmpDir, 'taxonomies', 'tags.yaml')
      const content = await fs.readFile(filePath, 'utf-8')
      expect(content).toContain('title: Updated Tags')
    })

    it('preserves JSON format when updating a JSON file', async () => {
      await writeDefinition('navigations', 'main', JSON.stringify({ title: 'Main' }), '.json')

      const loader = new DefinitionLoader(tmpDir)
      await loader.update('navigations', 'main', { title: 'Updated Main', max_depth: 5 })

      const filePath = path.join(tmpDir, 'navigations', 'main.json')
      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(content)
      expect(parsed.title).toBe('Updated Main')
      expect(parsed.max_depth).toBe(5)
    })

    it('throws DefinitionNotFoundError when handle does not exist', async () => {
      const loader = new DefinitionLoader(tmpDir)
      await expect(loader.update('taxonomies', 'nonexistent', { title: 'X' }))
        .rejects.toThrow(DefinitionNotFoundError)
    })

    it('throws DefinitionValidationError when updated data is invalid', async () => {
      await writeDefinition('taxonomies', 'tags', 'title: Tags\n')

      const loader = new DefinitionLoader(tmpDir)
      await expect(loader.update('taxonomies', 'tags', { blueprint: 'missing_title' }))
        .rejects.toThrow(DefinitionValidationError)
    })
  })

  describe('delete', () => {
    it('deletes an existing definition file', async () => {
      await writeDefinition('taxonomies', 'tags', 'title: Tags\n')

      const loader = new DefinitionLoader(tmpDir)
      await loader.delete('taxonomies', 'tags')

      const filePath = path.join(tmpDir, 'taxonomies', 'tags.yaml')
      await expect(fs.stat(filePath)).rejects.toThrow()
    })

    it('throws DefinitionNotFoundError when handle does not exist', async () => {
      const loader = new DefinitionLoader(tmpDir)
      await expect(loader.delete('taxonomies', 'nonexistent'))
        .rejects.toThrow(DefinitionNotFoundError)
    })

    it('deleted definition is no longer discoverable', async () => {
      await writeDefinition('globals', 'site', 'title: Site\n')

      const loader = new DefinitionLoader(tmpDir)
      await loader.delete('globals', 'site')

      const result = await loader.discover('globals')
      expect(result.has('site')).toBe(false)
    })
  })
})
