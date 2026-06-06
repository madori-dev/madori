import type { Command } from 'commander'
import * as path from 'path'
import { GenerationPipeline } from '../generators/generation-pipeline.js'
import { TypeGenerator } from '../generators/type-generator.js'
import { SchemaGenerator } from '../generators/schema-generator.js'
import { GraphQLSDKGenerator } from '../generators/graphql-sdk-generator.js'
import { SDKClientGenerator } from '../generators/sdk-client-generator.js'
import { WatchMode } from '../generators/watch-mode.js'

// --- Command registration ---

const DEFAULT_OUTPUT_DIR = '.madori/generated'
const DEFAULT_BLUEPRINT_DIR = 'resources/blueprints'

export function registerGenerate(program: Command): void {
  program
    .command('generate')
    .description('Generate TypeScript types, schemas, and SDK from blueprints')
    .option('-o, --output <path>', 'Output directory for generated files', DEFAULT_OUTPUT_DIR)
    .option('-w, --watch', 'Watch blueprint files and regenerate on change')
    .action(async (options: { output: string; watch?: boolean }) => {
      const outputDir = path.resolve(process.cwd(), options.output)
      const blueprintDir = path.resolve(process.cwd(), DEFAULT_BLUEPRINT_DIR)

      const pipeline = new GenerationPipeline(
        new TypeGenerator(),
        new SchemaGenerator(),
        new GraphQLSDKGenerator(),
        new SDKClientGenerator(),
        { outputDir, blueprintDir }
      )

      try {
        const result = await pipeline.run()

        console.log(
          `✓ Generate complete: ${result.blueprintsProcessed} blueprint(s) processed, ` +
          `${result.filesGenerated} file(s) generated in ${result.durationMs.toFixed(0)}ms`
        )

        if (options.watch) {
          const watchMode = new WatchMode(
            { blueprintDir, outputDir, debounceMs: 300 },
            pipeline
          )
          watchMode.start()
        }
      } catch (err: unknown) {
        const error = err as Error
        console.error(`✗ Generation failed: ${error.message}`)
        process.exitCode = 1
      }
    })
}
