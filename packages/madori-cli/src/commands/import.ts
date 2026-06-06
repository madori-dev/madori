import type { Command } from 'commander'
import { importArchive } from '../portability/archive-importer.js'

export function registerImport(program: Command): void {
  program
    .command('import <archive-path>')
    .description('Import blueprints, collections, fieldsets, and content from an archive')
    .action(async (archivePath: string) => {
      try {
        const result = await importArchive({ archivePath })

        console.log(`\n✓ Import completed successfully!\n`)
        console.log(`  Total files: ${result.totalFiles}`)
        console.log(`  Imported:    ${result.imported}`)
        console.log(`  Skipped:     ${result.skipped}`)
        console.log(`  Conflicts:   ${result.conflicts}`)
        console.log()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`\nError: ${message}\n`)
        process.exitCode = 1
      }
    })
}
