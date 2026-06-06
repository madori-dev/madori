import { describe, it, expect, afterEach } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { GenerationPipeline } from '../generation-pipeline.js'
import { TypeGenerator } from '../type-generator.js'
import { SchemaGenerator } from '../schema-generator.js'
import { GraphQLSDKGenerator } from '../graphql-sdk-generator.js'
import { SDKClientGenerator } from '../sdk-client-generator.js'

/**
 * Property 10: Output directory is clean after generation
 *
 * For any prior state of the Generated_Types_Directory (including stale files
 * from previous runs), after a successful `generate` command, the directory
 * SHALL contain only the files produced by the current generation pass plus
 * the `.gitignore` file.
 *
 * **Validates: Requirements 8.6**
 */

const BLUEPRINT_YAML = `tabs:
  main:
    fields:
      - handle: title
        field:
          type: text
          required: true
`

/** Generate a valid filename that won't collide with generated output paths */
const staleFilenameArb = fc
  .tuple(
    fc.stringMatching(/^[a-z]{1,8}$/),
    fc.constantFrom('.ts', '.js', '.json', '.txt', '.md', '.css')
  )
  .map(([name, ext]) => `stale-${name}${ext}`)

/** Recursively list all files in a directory, returning paths relative to root */
async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const subFiles = await listFilesRecursive(fullPath)
      files.push(...subFiles.map((f) => path.join(entry.name, f)))
    } else {
      files.push(entry.name)
    }
  }

  return files
}

describe('Property 10: Output directory is clean after generation', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    for (const dir of tempDirs) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
    }
    tempDirs.length = 0
  })

  it('no stale files remain after generation — only current-run files plus .gitignore', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(staleFilenameArb, { minLength: 1, maxLength: 10 }),
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 10 }),
        async (staleFilenames, staleContents) => {
          // 1. Create temp directories for output and blueprints
          const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-clean-'))
          tempDirs.push(tmpBase)

          const outputDir = path.join(tmpBase, 'generated')
          const blueprintDir = path.join(tmpBase, 'blueprints')

          await fs.mkdir(outputDir, { recursive: true })
          await fs.mkdir(blueprintDir, { recursive: true })

          // 2. Seed the output directory with stale files
          for (let i = 0; i < staleFilenames.length; i++) {
            const content = staleContents[i % staleContents.length]
            await fs.writeFile(path.join(outputDir, staleFilenames[i]), content, 'utf-8')
          }

          // Also seed a stale subdirectory with a file
          const staleSubdir = path.join(outputDir, 'stale-subdir')
          await fs.mkdir(staleSubdir, { recursive: true })
          await fs.writeFile(path.join(staleSubdir, 'old-file.ts'), '// old', 'utf-8')

          // 3. Write blueprint YAML
          await fs.writeFile(path.join(blueprintDir, 'test.yaml'), BLUEPRINT_YAML, 'utf-8')

          // 4. Run the generation pipeline
          const pipeline = new GenerationPipeline(
            new TypeGenerator(),
            new SchemaGenerator(),
            new GraphQLSDKGenerator(),
            new SDKClientGenerator(),
            { outputDir, blueprintDir }
          )

          await pipeline.run()

          // 5. List all files in the output directory
          const outputFiles = await listFilesRecursive(outputDir)

          // 6. Assert no stale files remain
          for (const staleFile of staleFilenames) {
            expect(outputFiles).not.toContain(staleFile)
          }
          expect(outputFiles.join(',')).not.toContain('stale-subdir')

          // 7. Assert .gitignore is present
          expect(outputFiles).toContain('.gitignore')

          // 8. Assert all files are from the current generation run
          // The pipeline produces: types/*.ts, schemas/*.ts, graphql/*.ts,
          // client.ts, index.ts, .gitignore, tsconfig.paths.json
          for (const file of outputFiles) {
            const isGeneratedType = file.startsWith('types' + path.sep) || file.startsWith('types/')
            const isGeneratedSchema = file.startsWith('schemas' + path.sep) || file.startsWith('schemas/')
            const isGeneratedGraphql = file.startsWith('graphql' + path.sep) || file.startsWith('graphql/')
            const isClient = file === 'client.ts'
            const isBarrel = file === 'index.ts'
            const isGitignore = file === '.gitignore'
            const isTsconfigPaths = file === 'tsconfig.paths.json'

            const isExpected = isGeneratedType || isGeneratedSchema || isGeneratedGraphql ||
              isClient || isBarrel || isGitignore || isTsconfigPaths

            expect(isExpected, `Unexpected file in output: ${file}`).toBe(true)
          }
        }
      ),
      { numRuns: 30 }
    )
  })
})
