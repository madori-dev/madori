import type { Command } from 'commander'
import * as path from 'path'
import * as fs from 'fs/promises'
import { UniversalFileParser } from '../../../../src/lib/fs/parser.js'

export interface MigrationResult {
  created: string[]
  skipped: string[]
  warnings: string[]
}

type MigratableEntityType = 'taxonomies' | 'globals' | 'navigations'

interface LegacyEntityDefinition {
  handle: string
  [key: string]: unknown
}

/**
 * Reads a config file and extracts legacy entity definitions
 * (taxonomies, globals, navigations) that should be migrated to flat files.
 */
async function loadConfigEntities(
  configPath: string
): Promise<Record<MigratableEntityType, LegacyEntityDefinition[]>> {
  const absolutePath = path.resolve(configPath)

  // Use dynamic import for TypeScript config files
  const configModule = await import(absolutePath)
  const config = configModule.default ?? configModule

  const result: Record<MigratableEntityType, LegacyEntityDefinition[]> = {
    taxonomies: [],
    globals: [],
    navigations: [],
  }

  const entityTypes: MigratableEntityType[] = ['taxonomies', 'globals', 'navigations']

  for (const entityType of entityTypes) {
    if (Array.isArray(config[entityType])) {
      result[entityType] = config[entityType]
    }
  }

  return result
}

/**
 * Migrates entity definitions from madori.config.ts to individual YAML files
 * under the resources directory.
 */
export async function migrateDefinitions(
  configPath: string,
  resourcesPath: string
): Promise<MigrationResult> {
  const result: MigrationResult = {
    created: [],
    skipped: [],
    warnings: [],
  }

  const parser = new UniversalFileParser()

  // Load entities from config
  let entities: Record<MigratableEntityType, LegacyEntityDefinition[]>
  try {
    entities = await loadConfigEntities(configPath)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    result.warnings.push(`Failed to load config file: ${message}`)
    return result
  }

  const entityTypes: MigratableEntityType[] = ['taxonomies', 'globals', 'navigations']

  for (const entityType of entityTypes) {
    const definitions = entities[entityType]
    if (definitions.length === 0) continue

    // Ensure output directory exists
    const outputDir = path.resolve(resourcesPath, entityType)
    await fs.mkdir(outputDir, { recursive: true })

    for (const definition of definitions) {
      if (!definition.handle) {
        result.warnings.push(
          `Skipping ${entityType} entry without a handle: ${JSON.stringify(definition)}`
        )
        continue
      }

      const targetFile = path.join(outputDir, `${definition.handle}.yaml`)
      const relativePath = path.relative(process.cwd(), targetFile)

      // Check if file already exists
      try {
        await fs.access(targetFile)
        // File exists — skip
        result.skipped.push(relativePath)
        result.warnings.push(`File already exists, skipping: ${relativePath}`)
        continue
      } catch {
        // File doesn't exist — proceed with creation
      }

      // Strip handle from definition data (handle is derived from filename)
      const { handle: _handle, ...definitionData } = definition

      // Serialize and write
      const content = parser.serialize(definitionData, 'yaml')
      await fs.writeFile(targetFile, content, 'utf-8')
      result.created.push(relativePath)
    }
  }

  return result
}

/**
 * Registers the migrate:definitions command with the CLI program.
 */
export function registerMigrateDefinitions(program: Command): void {
  program
    .command('migrate:definitions')
    .description('Migrate entity definitions from madori.config.ts to flat files under resources/')
    .option('--config <path>', 'Path to madori.config.ts', './madori.config.ts')
    .option('--resources <path>', 'Path to resources directory', './resources')
    .action(async (options: { config: string; resources: string }) => {
      const configPath = path.resolve(options.config)
      const resourcesPath = path.resolve(options.resources)

      console.log(`Migrating definitions from: ${configPath}`)
      console.log(`Writing to: ${resourcesPath}`)
      console.log('')

      const result = await migrateDefinitions(configPath, resourcesPath)

      // Output summary
      if (result.created.length > 0) {
        console.log('Created:')
        for (const file of result.created) {
          console.log(`  ✓ ${file}`)
        }
        console.log('')
      }

      if (result.skipped.length > 0) {
        console.log('Skipped (already exist):')
        for (const file of result.skipped) {
          console.log(`  ⊘ ${file}`)
        }
        console.log('')
      }

      if (result.warnings.length > 0) {
        console.log('Warnings:')
        for (const warning of result.warnings) {
          console.log(`  ⚠ ${warning}`)
        }
        console.log('')
      }

      console.log(
        `Summary: Created: ${result.created.length} files, Skipped: ${result.skipped.length} files, Warnings: ${result.warnings.length}`
      )
    })
}
