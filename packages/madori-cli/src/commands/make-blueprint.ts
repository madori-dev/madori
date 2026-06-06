import type { Command } from 'commander'
import {
  generateBlueprintFromContent,
  generateBlueprintFromSchema,
  generateBlueprintInteractive,
} from '../generators/blueprint-generator.js'

export function registerMakeBlueprint(program: Command): void {
  program
    .command('make:blueprint <handle>')
    .description('Generate a blueprint from content, schema, or interactively')
    .option('--from-content <path>', "Infer blueprint from a Markdown file's frontmatter")
    .option('--from-schema <path>', 'Generate blueprint from a JSON Schema file')
    .action(async (handle: string, options: { fromContent?: string; fromSchema?: string }) => {
      try {
        const result = options.fromContent
          ? await generateBlueprintFromContent(handle, options.fromContent)
          : options.fromSchema
            ? await generateBlueprintFromSchema(handle, options.fromSchema)
            : await generateBlueprintInteractive(handle)

        if (!result.written) {
          console.error('\nBlueprint validation failed:\n')
          for (const error of result.validationErrors ?? []) {
            console.error(`  - ${error}`)
          }
          console.error()
          process.exitCode = 1
          return
        }

        console.log(`\n✓ Blueprint "${handle}" created successfully!\n`)
        console.log(`  Output: ${result.outputPath}`)
        console.log(`  Fields: ${result.fields.length}`)

        const lowConfidence = result.fields.filter((f) => f.confidence === 'low')
        if (lowConfidence.length > 0) {
          console.log(`\n⚠ ${lowConfidence.length} field(s) defaulted to "text" (low confidence):`)
          for (const field of lowConfidence) {
            console.log(`    - ${field.handle}`)
          }
        }

        console.log()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`\nError: ${message}\n`)
        process.exitCode = 1
      }
    })
}
