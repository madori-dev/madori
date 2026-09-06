import { describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { graphql, parse, validate } from 'graphql'
import { glob } from 'glob'
import { GraphQLSDKGenerator } from '../../../packages/madori-cli/src/generators/graphql-sdk-generator'
import { TypeGenerator } from '../../../packages/madori-cli/src/generators/type-generator'
import { SchemaGenerator } from '../../../packages/madori-cli/src/generators/schema-generator'
import { SDKClientGenerator } from '../../../packages/madori-cli/src/generators/sdk-client-generator'
import { GenerationPipeline } from '../../../packages/madori-cli/src/generators/generation-pipeline'
import { SchemaGeneratorImpl } from '@/lib/graphql/schema-generator'
import { buildResolvers } from '@/lib/graphql/resolvers'

describe('generated GraphQL output contract', () => {
  it('runs pipeline output for shared blueprints and imported nested fields against schema', async () => {
    const root = await mkdtemp(join(process.cwd(), 'tests/.generated-pipeline-'))
    try {
      const blueprintDir = join(root, 'resources/blueprints')
      await mkdir(join(blueprintDir, 'collections'), { recursive: true })
      await mkdir(join(root, 'resources/collections'), { recursive: true })
      await mkdir(join(root, 'resources/fieldsets'), { recursive: true })
      await writeFile(join(root, 'resources/collections/articles.yaml'), 'blueprint: shared\n', 'utf8')
      await writeFile(join(root, 'resources/collections/case-studies.yaml'), 'blueprint: shared\n', 'utf8')
      await writeFile(join(blueprintDir, 'collections/shared.yaml'), `tabs:
  main:
    fields:
      - import: common
      - handle: blocks
        field:
          type: blocks
          options: { sets: [hero] }
`, 'utf8')
      await writeFile(join(root, 'resources/fieldsets/common.yaml'), `fields:
  - handle: hero-image
    field: { type: text }
  - handle: __schema
    field: { type: text }
`, 'utf8')
      await writeFile(join(root, 'resources/fieldsets/hero.yaml'), `fields:
  - handle: hero-image
    field: { type: text }
`, 'utf8')
      const pipeline = new GenerationPipeline(new TypeGenerator(), new SchemaGenerator(), new GraphQLSDKGenerator(), new SDKClientGenerator(), { blueprintDir, outputDir: join(root, 'generated') })
      await pipeline.run()
      const operation = await readFile(join(root, 'generated/graphql/articles-operations.ts'), 'utf8')
      expect(operation).toContain('articles(slug: $slug)')
      expect(operation).toContain('hero_image')
      expect(operation).toContain('... on ArticlesBlocksHeroSet')
      expect(operation).toContain('$filter: SharedFilterInput')
      expect(operation).toContain('field_schema')

      const sourceBlueprint = { handle: 'shared', tabs: { main: { fields: [{ handle: 'hero-image', field: { type: 'text' as const } }, { handle: '__schema', field: { type: 'text' as const } }, { handle: 'blocks', field: { type: 'blocks' as const, options: { sets: ['hero'] } } }] } } }
      const collections = [{ handle: 'articles', title: 'Articles', blueprint: 'shared' }, { handle: 'case-studies', title: 'Case studies', blueprint: 'shared' }]
      const schema = new SchemaGeneratorImpl({ getFieldset: (handle) => handle === 'hero' ? [{ handle: 'hero-image', field: { type: 'text' as const } }] : undefined }).generateSchema([sourceBlueprint], collections, {})
      for (const file of await glob(join(root, 'generated/graphql/*-operations.ts'))) {
        for (const match of (await readFile(file, 'utf8')).matchAll(/parse\(`([^`]+)`\)/g)) {
          expect(validate(schema, parse(match[1]))).toEqual([])
        }
      }
      const query = operation.match(/parse\(`([^`]+)`\)/)?.[1]
      expect(query).toBeDefined()
      const result = await graphql({ schema, source: query!.replace(/\\n/g, '\n'), variableValues: { slug: 'hello' }, rootValue: { articles: { 'hero-image': 'x', __schema: 'Authored value', blocks: [{ _type: 'hero', 'hero-image': 'Nested value' }] } } })
      expect(result.errors).toBeUndefined()
      expect(result.data?.articles).toMatchObject({ hero_image: 'x', field_schema: 'Authored value', blocks: [{ _type: 'hero', hero_image: 'Nested value' }] })

      const sdkSource = join(process.cwd(), 'packages/madori-sdk/src/index.ts')
      ts.createProgram([sdkSource], { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, declaration: true, emitDeclarationOnly: true, skipLibCheck: true, rootDir: join(process.cwd(), 'packages/madori-sdk/src'), outDir: join(root, 'sdk-dist') }).emit()
      const program = ts.createProgram(await glob(join(root, 'generated/**/*.ts')), {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
        strict: true, esModuleInterop: true, skipLibCheck: true, noEmit: true,
        paths: { '@madori/sdk': [join(root, 'sdk-dist/index.d.ts')] },
      })
      expect(ts.getPreEmitDiagnostics(program).map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('compiles two collections and executes generated get/list modules', async () => {
    const root = await mkdtemp(join(process.cwd(), 'tests/.generated-output-'))
    let originalFetch: typeof fetch | undefined
    try {
      const fieldsets = new Map([['hero', [{ handle: 'heading', field: { type: 'text' as const } }]]])
      const blueprints = [
        { handle: 'blog', tabs: { main: { fields: [{ handle: 'hero-image', field: { type: 'asset' as const, required: true, options: { max_files: 3 } } }, { handle: 'related', field: { type: 'entries' as const } }, { handle: 'blocks', field: { type: 'blocks' as const, options: { sets: ['hero'] } } }] } } },
        { handle: 'pages', tabs: { main: { fields: [{ handle: 'headline', field: { type: 'text' as const } }, { handle: 'rows', field: { type: 'grid' as const, options: { sets: ['hero'] } } }] } } },
      ]
      const typeGenerator = new TypeGenerator()
      const typeFiles = typeGenerator.generate(blueprints)
      const generated = [...typeFiles, ...(await new GraphQLSDKGenerator(fieldsets).generate(blueprints)), ...new SchemaGenerator().generate(blueprints), new SDKClientGenerator().generate(blueprints), { filename: 'types/index.ts', content: typeGenerator.generateTypesBarrel(typeFiles) }, { filename: 'index.ts', content: typeGenerator.generateBarrel(typeFiles) }]
      for (const file of generated) {
        const target = join(root, file.filename)
        await mkdir(join(target, '..'), { recursive: true })
        await writeFile(target, file.content)
      }
      const sdkSource = join(process.cwd(), 'packages/madori-sdk/src/index.ts')
      const sdkProgram = ts.createProgram([sdkSource], { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, declaration: true, emitDeclarationOnly: true, skipLibCheck: true, rootDir: join(process.cwd(), 'packages/madori-sdk/src'), outDir: join(root, 'sdk-dist') })
      sdkProgram.emit()
      const tsconfig = { compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, esModuleInterop: true, skipLibCheck: true, rootDir: root, outDir: join(root, 'dist'), paths: { '@madori/sdk': [join(root, 'sdk-dist/index.d.ts')] } }, include: [join(root, '**/*.ts')] }
      await writeFile(join(root, 'tsconfig.json'), JSON.stringify(tsconfig))
      const program = ts.createProgram({ rootNames: generated.map((file) => join(root, file.filename)), options: ts.convertCompilerOptionsFromJson(tsconfig.compilerOptions, root).options })
      const diagnostics = ts.getPreEmitDiagnostics(program)
      expect(diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))).toEqual([])
      program.emit()

      const entries = { title: 'Hello', slug: 'hello', status: 'published', content: '', data: { 'hero-image': ['hero.jpg', 'hero-2.jpg'], related: ['pages/home'], blocks: [{ _type: 'hero', heading: 'Welcome' }] }, createdAt: '', updatedAt: '' }
      const collections = [{ handle: 'blog', title: 'Blog', blueprint: 'blog', route: '/{slug}' }, { handle: 'pages', title: 'Pages', blueprint: 'pages', route: '/{slug}' }]
      const schema = new SchemaGeneratorImpl({ getFieldset: (handle) => fieldsets.get(handle) }).generateSchema(blueprints, collections, buildResolvers(collections, {}))
      const client = await import(pathToFileURL(join(root, 'dist/graphql/client.js')).href)
      const operations = await import(pathToFileURL(join(root, 'dist/graphql/blog-operations.js')).href)
      client.configureGraphQL({ endpoint: '/graphql' })
      originalFetch = globalThis.fetch
      let capturedVariables: Record<string, unknown> | undefined
      globalThis.fetch = async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { query: string; variables?: Record<string, unknown> }
        capturedVariables = body.variables
        const result = await graphql({ schema, source: body.query, variableValues: body.variables, contextValue: { contentEngine: { getEntry: async () => entries, listEntries: async () => [entries] }, blueprintRegistry: { getBlueprint: async () => blueprints[0] } } })
        return new Response(JSON.stringify(result), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      const single = await operations.getBlogEntry('hello')
      const list = await operations.listBlogEntries({ sort: 'title', order: 'desc' })
      expect(single?.collection).toBe('blog')
      expect(single?.hero_image).toBeUndefined()
      expect(single?.blocks).toEqual([{ _type: 'hero', heading: 'Welcome' }])
      expect(single?.['hero-image']).toEqual(['hero.jpg', 'hero-2.jpg'])
      expect(list[0]?.related).toEqual(['pages/home'])
      expect(capturedVariables?.sort).toBe('title:desc')
    } finally {
      if (originalFetch) globalThis.fetch = originalFetch
      await rm(root, { recursive: true, force: true })
    }
  })
})
