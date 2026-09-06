import * as fs from 'fs/promises'
import * as path from 'path'
import { glob } from 'glob'
import YAML from 'yaml'
import type { Blueprint, BlueprintTab, FieldDefinition } from '@madori/lib/blueprints/types.js'

// --- Generator interfaces (implemented in later tasks) ---

export interface GeneratedFile {
  filename: string
  content: string
  blueprintHandle?: string
}

export interface TypeGeneratorInterface {
  generate(blueprints: Blueprint[]): GeneratedFile[]
  generateBarrel(files: GeneratedFile[]): string
  generateTypesBarrel(files: GeneratedFile[]): string
}

export interface SchemaGeneratorInterface {
  generate(blueprints: Blueprint[]): GeneratedFile[]
}

export interface GraphQLSDKGeneratorInterface {
  generate(blueprints: Blueprint[]): Promise<GeneratedFile[]>
  setFieldsets?(fieldsets: ReadonlyMap<string, FieldDefinition[]>): void
}

export interface SDKClientGeneratorInterface {
  generate(blueprints: Blueprint[]): GeneratedFile
}

// --- Pipeline options ---

export interface GenerationPipelineOptions {
  outputDir: string
  blueprintDir: string
}

export type GeneratedBlueprint = Blueprint & { sourceBlueprintHandle?: string }

// --- Result interface ---

export interface GenerationResult {
  blueprintsProcessed: number
  filesGenerated: number
  durationMs: number
}

// --- Pipeline ---

export class GenerationPipeline {
  constructor(
    private readonly typeGenerator: TypeGeneratorInterface,
    private readonly schemaGenerator: SchemaGeneratorInterface,
    private readonly graphqlGenerator: GraphQLSDKGeneratorInterface,
    private readonly sdkClientGenerator: SDKClientGeneratorInterface,
    private readonly options: GenerationPipelineOptions
  ) {}

  async run(): Promise<GenerationResult> {
    const startTime = performance.now()

    // 1. Load and parse all definitions before touching existing output.
    const blueprints = await this.loadBlueprints()
    if (this.graphqlGenerator.setFieldsets) {
      this.graphqlGenerator.setFieldsets(await this.loadFieldsets())
    }

    // 2. Run all generators
    const typeFiles = this.typeGenerator.generate(blueprints)
    const schemaFiles = this.schemaGenerator.generate(blueprints)
    const graphqlFiles = await this.graphqlGenerator.generate(blueprints)
    const clientFile = this.sdkClientGenerator.generate(blueprints)

    // 3. Replace output only after loading and generation succeeded.
    await this.clearOutputDir()
    const allFiles = [...typeFiles, ...schemaFiles, ...graphqlFiles, clientFile]
    await this.writeAll(allFiles)

    // 5. Generate supporting files
    await this.writeBarrel(typeFiles)
    await this.writeGitignore()
    await this.writeTsconfigPaths()

    const durationMs = performance.now() - startTime

    return {
      blueprintsProcessed: blueprints.length,
      filesGenerated: allFiles.length + 3, // +3 for barrel, gitignore, tsconfig paths
      durationMs,
    }
  }

  private async loadFieldsets(): Promise<Map<string, FieldDefinition[]>> {
    const result = new Map<string, FieldDefinition[]>()
    const fieldsetDir = path.resolve(this.options.blueprintDir, '..', 'fieldsets')
    const loading = new Set<string>()
    const load = async (handle: string): Promise<FieldDefinition[]> => {
      if (result.has(handle)) return result.get(handle)!
      if (loading.has(handle)) throw new Error(`[generate] Circular fieldset import: ${handle}`)
      loading.add(handle)
      const file = path.join(fieldsetDir, `${handle}.yaml`)
      const parsed = YAML.parse(await fs.readFile(file, 'utf-8')) as { fields?: unknown[] }
      const fields: FieldDefinition[] = []
      for (const entry of parsed?.fields ?? []) {
        if (entry && typeof entry === 'object' && typeof (entry as { import?: unknown }).import === 'string') {
          fields.push(...await load((entry as { import: string }).import))
        } else if (entry && typeof entry === 'object' && typeof (entry as { handle?: unknown }).handle === 'string') {
          fields.push(entry as FieldDefinition)
        } else {
          throw new Error(`[generate] Invalid fieldset entry in ${file}`)
        }
      }
      loading.delete(handle)
      result.set(handle, fields)
      return fields
    }
    for (const file of await glob(path.join(fieldsetDir, '*.yaml'))) {
      await load(path.basename(file, '.yaml'))
    }
    return result
  }

  /**
   * Clear the output directory to prevent stale files from previous runs.
   * Creates the directory if it does not exist.
   */
  private async clearOutputDir(): Promise<void> {
    const { outputDir } = this.options

    try {
      await fs.rm(outputDir, { recursive: true, force: true })
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        throw new Error(
          `Permission denied: cannot clear output directory "${outputDir}". ` +
          `Check file system permissions.`
        )
      }
      // ENOENT is fine — directory doesn't exist yet
      if (error.code !== 'ENOENT') {
        throw error
      }
    }

    try {
      await fs.mkdir(outputDir, { recursive: true })
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        throw new Error(
          `Permission denied: cannot create output directory "${outputDir}". ` +
          `Check file system permissions.`
        )
      }
      throw error
    }
  }

  /**
   * Load and parse all blueprint YAML files from the configured blueprint directory.
   * Invalid blueprints are logged and skipped.
   */
  private async loadBlueprints(): Promise<Blueprint[]> {
    const { blueprintDir } = this.options
    const collectionsDir = path.resolve(blueprintDir, '..', 'collections')
    if (await fs.stat(collectionsDir).then(() => true, () => false)) {
      const files = await glob(path.join(collectionsDir, '*.yaml'))
      const blueprints: GeneratedBlueprint[] = []
      for (const collectionFile of files) {
        const collection = YAML.parse(await fs.readFile(collectionFile, 'utf-8')) as { blueprint?: string }
        const collectionHandle = path.basename(collectionFile, '.yaml')
        const blueprintHandle = collection?.blueprint || collectionHandle
        const candidates = [
          path.join(blueprintDir, 'collections', `${blueprintHandle}.yaml`),
          path.join(blueprintDir, `${blueprintHandle}.yaml`),
        ]
        let source: string | undefined
        for (const candidate of candidates) {
          try { source = await fs.readFile(candidate, 'utf-8'); break } catch { /* try next location */ }
        }
        if (!source) throw new Error(`[generate] Blueprint "${blueprintHandle}" referenced by collection "${collectionHandle}" was not found`)
        const parsed = YAML.parse(source) as { tabs?: Record<string, unknown> }
        if (!parsed?.tabs) throw new Error(`[generate] Blueprint "${blueprintHandle}" has no tabs`)
        const tabs = parsed.tabs as Record<string, BlueprintTab>
        for (const tab of Object.values(tabs)) {
          tab.fields = await this.resolveImportedFields(tab.fields, path.resolve(blueprintDir, '..', 'fieldsets'))
          for (const section of Object.values(tab.sections ?? {})) {
            section.fields = await this.resolveImportedFields(section.fields, path.resolve(blueprintDir, '..', 'fieldsets'))
          }
        }
        blueprints.push({ handle: collectionHandle, sourceBlueprintHandle: blueprintHandle, tabs })
      }
      return blueprints
    }
    const pattern = path.join(blueprintDir, '**/*.yaml')
    const files = await glob(pattern)
    const blueprints: Blueprint[] = []

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8')
        const parsed = YAML.parse(content) as { tabs?: Record<string, unknown> }

        if (!parsed || !parsed.tabs) {
          console.warn(`[generate] Skipping "${filePath}": no tabs defined`)
          continue
        }

        // Derive handle from filename (e.g., blog.yaml → blog)
        const handle = path.basename(filePath, '.yaml')

        const blueprint: Blueprint = {
          handle,
          tabs: parsed.tabs as Record<string, BlueprintTab>,
        }

        blueprints.push(blueprint)
      } catch (err: unknown) {
        const error = err as Error
        console.warn(
          `[generate] Skipping "${filePath}": ${error.message}`
        )
      }
    }

    return blueprints
  }

  private async resolveImportedFields(fields: unknown[], fieldsetDir: string, stack: string[] = []): Promise<FieldDefinition[]> {
    const result: FieldDefinition[] = []
    for (const entry of fields ?? []) {
      if (entry && typeof entry === 'object' && typeof (entry as { import?: unknown }).import === 'string') {
        const handle = (entry as { import: string }).import
        if (stack.includes(handle)) throw new Error(`[generate] Circular fieldset import: ${[...stack, handle].join(' -> ')}`)
        const file = path.join(fieldsetDir, `${handle}.yaml`)
        let parsed: { fields?: unknown[] }
        try { parsed = YAML.parse(await fs.readFile(file, 'utf-8')) as { fields?: unknown[] } } catch {
          throw new Error(`[generate] Fieldset "${handle}" imported by blueprint was not found`)
        }
        result.push(...await this.resolveImportedFields(parsed.fields ?? [], fieldsetDir, [...stack, handle]))
      } else if (entry && typeof entry === 'object' && typeof (entry as { handle?: unknown }).handle === 'string' && (entry as { field?: unknown }).field) {
        result.push(entry as FieldDefinition)
      } else {
        throw new Error('[generate] Invalid field or fieldset import in blueprint')
      }
    }
    return result
  }

  /**
   * Write all generated files to the output directory, creating subdirectories as needed.
   */
  private async writeAll(files: GeneratedFile[]): Promise<void> {
    const { outputDir } = this.options

    for (const file of files) {
      const filePath = path.join(outputDir, file.filename)
      const dir = path.dirname(filePath)

      await fs.mkdir(dir, { recursive: true })

      try {
        await fs.writeFile(filePath, file.content, 'utf-8')
      } catch (err: unknown) {
        const error = err as NodeJS.ErrnoException
        if (error.code === 'EACCES' || error.code === 'EPERM') {
          throw new Error(
            `Permission denied: cannot write file "${filePath}". ` +
            `Check file system permissions.`
          )
        }
        throw error
      }
    }
  }

  /**
   * Write the barrel index.ts re-exporting all generated types and modules,
   * and the types/index.ts barrel re-exporting individual type files.
   */
  private async writeBarrel(typeFiles: GeneratedFile[]): Promise<void> {
    const { outputDir } = this.options

    // Write the types/index.ts barrel
    const typesBarrel = this.typeGenerator.generateTypesBarrel(typeFiles)
    const typesBarrelPath = path.join(outputDir, 'types', 'index.ts')
    await fs.mkdir(path.dirname(typesBarrelPath), { recursive: true })
    await fs.writeFile(typesBarrelPath, typesBarrel, 'utf-8')

    // Write the top-level index.ts barrel
    const barrel = this.typeGenerator.generateBarrel(typeFiles)
    const barrelPath = path.join(outputDir, 'index.ts')
    await fs.writeFile(barrelPath, barrel, 'utf-8')
  }

  /**
   * Write a .gitignore file containing `*` to exclude generated files from version control.
   */
  private async writeGitignore(): Promise<void> {
    const { outputDir } = this.options
    const gitignorePath = path.join(outputDir, '.gitignore')
    await fs.writeFile(gitignorePath, '*\n', 'utf-8')
  }

  /**
   * Write a tsconfig.paths.json with the @madori/generated path alias.
   */
  private async writeTsconfigPaths(): Promise<void> {
    const { outputDir } = this.options
    const tsconfigPathsPath = path.join(outputDir, 'tsconfig.paths.json')

    const tsconfigPaths = {
      compilerOptions: {
        paths: {
          '@madori/generated': ['.'],
          '@madori/generated/*': ['./*'],
        },
      },
    }

    await fs.writeFile(
      tsconfigPathsPath,
      JSON.stringify(tsconfigPaths, null, 2) + '\n',
      'utf-8'
    )
  }
}
