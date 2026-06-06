import type { Command } from 'commander'
import { parseFieldDefinitions, generateCollection } from '../generators/collection-generator.js'

export function registerMakeCollection(program: Command): void {
  program
    .command('make:collection <handle>')
    .description('Scaffold a complete collection with blueprint and example entry')
    .option('--fields <fields>', 'Comma-separated field definitions (handle:type[:required])')
    .option('--route <route>', 'Route pattern for the collection')
    .action(async (handle: string, options: { fields?: string; route?: string }) => {
      try {
        const fields = options.fields ? parseFieldDefinitions(options.fields) : undefined

        const result = await generateCollection({
          handle,
          fields,
          route: options.route,
        })

        console.log(`\n✓ Collection "${handle}" created successfully!\n`)
        console.log('Files created:')
        for (const file of result.files) {
          console.log(`  - ${file}`)
        }
        console.log()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`\nError: ${message}\n`)
        process.exitCode = 1
      }
    })
}
