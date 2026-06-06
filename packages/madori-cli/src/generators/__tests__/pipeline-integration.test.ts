import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { GenerationPipeline } from '../generation-pipeline.js'
import { TypeGenerator } from '../type-generator.js'
import { SchemaGenerator } from '../schema-generator.js'
import { GraphQLSDKGenerator } from '../graphql-sdk-generator.js'
import { SDKClientGenerator } from '../sdk-client-generator.js'

describe('Pipeline Integration', () => {
  let tmpDir: string
  let blueprintDir: string
  let outputDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-pipeline-'))
    blueprintDir = path.join(tmpDir, 'blueprints')
    outputDir = path.join(tmpDir, 'generated')
    await fs.mkdir(blueprintDir, { recursive: true })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  function createPipeline() {
    const typeGenerator = new TypeGenerator()
    const schemaGenerator = new SchemaGenerator()
    const graphqlGenerator = new GraphQLSDKGenerator()
    const sdkClientGenerator = new SDKClientGenerator()

    return new GenerationPipeline(
      typeGenerator,
      schemaGenerator,
      graphqlGenerator,
      sdkClientGenerator,
      { outputDir, blueprintDir }
    )
  }

  describe('full generation from sample blueprint', () => {
    const blogYaml = `tabs:
  main:
    fields:
      - handle: title
        field:
          type: text
          display: Title
          required: true
      - handle: slug
        field:
          type: slug
          required: true
      - handle: content
        field:
          type: tiptap
      - handle: status
        field:
          type: select
          options:
            draft: Draft
            published: Published
`

    beforeEach(async () => {
      await fs.writeFile(path.join(blueprintDir, 'blog.yaml'), blogYaml, 'utf-8')
    })

    it('generates types/blog.ts with BlogEntry interface extending MadoriEntryMeta', async () => {
      const pipeline = createPipeline()
      await pipeline.run()

      const typesFile = await fs.readFile(path.join(outputDir, 'types', 'blog.ts'), 'utf-8')
      expect(typesFile).toContain('BlogEntry')
      expect(typesFile).toContain('extends MadoriEntryMeta')
    })

    it('generates required fields without ? and optional fields with ?', async () => {
      const pipeline = createPipeline()
      await pipeline.run()

      const typesFile = await fs.readFile(path.join(outputDir, 'types', 'blog.ts'), 'utf-8')
      // title is required — no ?
      expect(typesFile).toMatch(/title: string/)
      expect(typesFile).not.toMatch(/title\?: string/)
      // content is optional — has ?
      expect(typesFile).toContain('content?: string')
    })

    it('generates select fields as union of string literals', async () => {
      const pipeline = createPipeline()
      await pipeline.run()

      const typesFile = await fs.readFile(path.join(outputDir, 'types', 'blog.ts'), 'utf-8')
      expect(typesFile).toContain("'draft' | 'published'")
    })

    it('generates schemas/blog.ts with BlogEntrySchema and z.enum for select', async () => {
      const pipeline = createPipeline()
      await pipeline.run()

      const schemaFile = await fs.readFile(path.join(outputDir, 'schemas', 'blog.ts'), 'utf-8')
      expect(schemaFile).toContain('BlogEntrySchema')
      expect(schemaFile).toContain("z.enum(['draft', 'published'])")
    })

    it('generates graphql/blog-operations.ts with get and list functions', async () => {
      const pipeline = createPipeline()
      await pipeline.run()

      const graphqlFile = await fs.readFile(path.join(outputDir, 'graphql', 'blog-operations.ts'), 'utf-8')
      expect(graphqlFile).toContain('getBlogEntry')
      expect(graphqlFile).toContain('listBlogEntries')
    })

    it('generates client.ts with CollectionTypeMap containing blog', async () => {
      const pipeline = createPipeline()
      await pipeline.run()

      const clientFile = await fs.readFile(path.join(outputDir, 'client.ts'), 'utf-8')
      expect(clientFile).toContain('CollectionTypeMap')
      expect(clientFile).toContain('blog: BlogEntry')
    })

    it('generates index.ts barrel file', async () => {
      const pipeline = createPipeline()
      await pipeline.run()

      const barrelFile = await fs.readFile(path.join(outputDir, 'index.ts'), 'utf-8')
      expect(barrelFile).toContain("export * from './types/index.js'")
      expect(barrelFile).toContain("export * from './schemas/index.js'")
      expect(barrelFile).toContain("export * from './graphql/index.js'")
      expect(barrelFile).toContain("export * from './client.js'")
    })

    it('generates .gitignore with * content', async () => {
      const pipeline = createPipeline()
      await pipeline.run()

      const gitignore = await fs.readFile(path.join(outputDir, '.gitignore'), 'utf-8')
      expect(gitignore.trim()).toBe('*')
    })

    it('generates tsconfig.paths.json', async () => {
      const pipeline = createPipeline()
      await pipeline.run()

      const tsconfigPaths = await fs.readFile(path.join(outputDir, 'tsconfig.paths.json'), 'utf-8')
      const parsed = JSON.parse(tsconfigPaths)
      expect(parsed.compilerOptions.paths['@madori/generated']).toEqual(['.'])
    })
  })

  describe('invalid YAML is skipped with warning', () => {
    it('does not throw and warns about invalid YAML', async () => {
      const invalidYaml = `tabs:\n  main:\n    fields:\n      - handle: title\n        field:\n          type: text\n    invalid: [unterminated`
      await fs.writeFile(path.join(blueprintDir, 'broken.yaml'), invalidYaml, 'utf-8')

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const pipeline = createPipeline()

      // Pipeline should not throw
      const result = await pipeline.run()

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('broken.yaml')
      )
      // No blueprint processed since the only one was invalid
      expect(result.blueprintsProcessed).toBe(0)
    })

    it('does not generate files for the broken blueprint', async () => {
      const invalidYaml = `{{{invalid yaml content that cannot be parsed`
      await fs.writeFile(path.join(blueprintDir, 'broken.yaml'), invalidYaml, 'utf-8')

      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const pipeline = createPipeline()
      await pipeline.run()

      // types/broken.ts should not exist
      const typesDir = path.join(outputDir, 'types')
      try {
        const files = await fs.readdir(typesDir)
        expect(files).not.toContain('broken.ts')
      } catch {
        // types directory might not exist at all if no blueprints were processed — that's fine
      }
    })
  })

  describe('unknown field type maps to unknown with warning', () => {
    const unknownFieldYaml = `tabs:
  main:
    fields:
      - handle: weird
        field:
          type: nonexistent
`

    beforeEach(async () => {
      await fs.writeFile(path.join(blueprintDir, 'mystery.yaml'), unknownFieldYaml, 'utf-8')
    })

    it('generates the type with unknown for the unknown field type', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const pipeline = createPipeline()
      await pipeline.run()

      const typesFile = await fs.readFile(path.join(outputDir, 'types', 'mystery.ts'), 'utf-8')
      expect(typesFile).toContain('weird?: unknown')

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown field type')
      )
    })

    it('generates the schema with z.unknown() for the unknown field type', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const pipeline = createPipeline()
      await pipeline.run()

      const schemaFile = await fs.readFile(path.join(outputDir, 'schemas', 'mystery.ts'), 'utf-8')
      expect(schemaFile).toContain('z.unknown()')
    })
  })
})
