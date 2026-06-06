import * as fs from 'fs/promises'
import * as path from 'path'
import { glob } from 'glob'
import YAML from 'yaml'
import type { Blueprint, BlueprintTab } from '@madori/lib/blueprints/types.js'

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
}

export interface SDKClientGeneratorInterface {
  generate(blueprints: Blueprint[]): GeneratedFile
}

// --- Pipeline options ---

export interface GenerationPipelineOptions {
  outputDir: string
  blueprintDir: string
}

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

    // 1. Clear output directory
    await this.clearOutputDir()

    // 2. Load and parse all blueprints
    const blueprints = await this.loadBlueprints()

    // 3. Run all generators
    const typeFiles = this.typeGenerator.generate(blueprints)
    const schemaFiles = this.schemaGenerator.generate(blueprints)
    const graphqlFiles = await this.graphqlGenerator.generate(blueprints)
    const clientFile = this.sdkClientGenerator.generate(blueprints)

    // 4. Write all generated files
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
