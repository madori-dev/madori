import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { parse } from 'yaml'
import { yamlWriter } from '../../../../packages/madori-cli/src/utils/yaml-writer.js'
import type {
  CollectionDefinition,
  BlueprintDefinition,
  FieldsetDefinition,
} from '../../../../packages/madori-cli/src/utils/yaml-writer.js'

describe('yamlWriter', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yaml-writer-test-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('writeCollection', () => {
    it('writes a collection definition as valid YAML', async () => {
      const filePath = path.join(tmpDir, 'resources/collections/blog.yaml')
      const definition: CollectionDefinition = {
        title: 'Blog Posts',
        blueprint: 'blog-posts',
        route: '/blog/{slug}',
        defaultStatus: 'draft',
      }

      await yamlWriter.writeCollection(filePath, definition)

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = parse(content)
      expect(parsed).toEqual(definition)
    })

    it('creates parent directories if they do not exist', async () => {
      const filePath = path.join(tmpDir, 'deep/nested/dir/collection.yaml')
      const definition: CollectionDefinition = {
        title: 'Pages',
        blueprint: 'pages',
      }

      await yamlWriter.writeCollection(filePath, definition)

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = parse(content)
      expect(parsed.title).toBe('Pages')
      expect(parsed.blueprint).toBe('pages')
    })

    it('omits optional fields when not provided', async () => {
      const filePath = path.join(tmpDir, 'collection.yaml')
      const definition: CollectionDefinition = {
        title: 'Docs',
        blueprint: 'docs',
      }

      await yamlWriter.writeCollection(filePath, definition)

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = parse(content)
      expect(parsed.route).toBeUndefined()
      expect(parsed.defaultStatus).toBeUndefined()
    })
  })

  describe('writeBlueprint', () => {
    it('writes a blueprint definition with tabs and fields', async () => {
      const filePath = path.join(tmpDir, 'blueprints/collections/blog.yaml')
      const definition: BlueprintDefinition = {
        tabs: {
          main: {
            label: 'Main',
            fields: [
              {
                handle: 'title',
                field: { type: 'text', display: 'Title', required: true },
              },
              {
                handle: 'body',
                field: { type: 'tiptap', display: 'Body' },
              },
            ],
          },
        },
      }

      await yamlWriter.writeBlueprint(filePath, definition)

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = parse(content)
      expect(parsed.tabs.main.label).toBe('Main')
      expect(parsed.tabs.main.fields).toHaveLength(2)
      expect(parsed.tabs.main.fields[0].handle).toBe('title')
      expect(parsed.tabs.main.fields[0].field.type).toBe('text')
      expect(parsed.tabs.main.fields[0].field.required).toBe(true)
      expect(parsed.tabs.main.fields[1].handle).toBe('body')
    })

    it('handles multiple tabs', async () => {
      const filePath = path.join(tmpDir, 'blueprint.yaml')
      const definition: BlueprintDefinition = {
        tabs: {
          main: {
            label: 'Main',
            fields: [{ handle: 'title', field: { type: 'text' } }],
          },
          meta: {
            label: 'Meta',
            fields: [{ handle: 'seo_title', field: { type: 'text' } }],
          },
        },
      }

      await yamlWriter.writeBlueprint(filePath, definition)

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = parse(content)
      expect(Object.keys(parsed.tabs)).toEqual(['main', 'meta'])
    })
  })

  describe('writeFieldset', () => {
    it('writes a fieldset definition', async () => {
      const filePath = path.join(tmpDir, 'fieldsets/hero.yaml')
      const definition: FieldsetDefinition = {
        handle: 'hero',
        fields: [
          { handle: 'heading', field: { type: 'text', display: 'Heading', required: true } },
          { handle: 'subheading', field: { type: 'textarea', display: 'Subheading' } },
        ],
      }

      await yamlWriter.writeFieldset(filePath, definition)

      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = parse(content)
      expect(parsed.handle).toBe('hero')
      expect(parsed.fields).toHaveLength(2)
      expect(parsed.fields[0].field.type).toBe('text')
    })
  })

  describe('writeEntry', () => {
    it('writes a Markdown file with YAML frontmatter', async () => {
      const filePath = path.join(tmpDir, 'content/collections/blog/hello.md')
      const frontmatter = {
        title: 'Hello World',
        slug: 'hello-world',
        status: 'draft',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      }
      const content = '# Hello World\n\nThis is my first post.'

      await yamlWriter.writeEntry(filePath, frontmatter, content)

      const raw = await fs.readFile(filePath, 'utf-8')
      expect(raw).toMatch(/^---\n/)
      expect(raw).toContain('title: Hello World')
      expect(raw).toContain('slug: hello-world')
      expect(raw).toContain('status: draft')
      expect(raw).toMatch(/---\n\n# Hello World/)
      expect(raw).toContain('This is my first post.')
    })

    it('creates parent directories for entries', async () => {
      const filePath = path.join(tmpDir, 'deep/nested/entry.md')
      const frontmatter = { title: 'Test' }
      const content = 'Body text.'

      await yamlWriter.writeEntry(filePath, frontmatter, content)

      const raw = await fs.readFile(filePath, 'utf-8')
      expect(raw).toContain('title: Test')
      expect(raw).toContain('Body text.')
    })

    it('handles empty content body', async () => {
      const filePath = path.join(tmpDir, 'entry.md')
      const frontmatter = { title: 'Empty', slug: 'empty' }

      await yamlWriter.writeEntry(filePath, frontmatter, '')

      const raw = await fs.readFile(filePath, 'utf-8')
      expect(raw).toMatch(/^---\n/)
      expect(raw).toContain('title: Empty')
      expect(raw).toMatch(/---\n\n\n$/)
    })
  })
})
