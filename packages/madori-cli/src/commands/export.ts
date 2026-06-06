import type { Command } from 'commander'
import { exportArchive } from '../portability/archive-exporter.js'
import * as fs from 'fs/promises'

export function registerExport(program: Command): void {
  program
    .command('export <path>')
    .description('Export blueprints, collections, fieldsets, and content as an archive')
    .option('--format <format>', 'Archive format: zip or tar', 'zip')
    .option('--resources <types>', 'Comma-separated resource types to include (blueprints,collections,fieldsets,content)')
    .action(async (outputPath: string, options: { format: string; resources?: string }) => {
      try {
        const format = options.format as 'zip' | 'tar'
        if (format !== 'zip' && format !== 'tar') {
          throw new Error(`Invalid format "${options.format}". Must be "zip" or "tar".`)
        }

        const resources = options.resources
          ? options.resources.split(',').map((r) => r.trim())
          : undefined

        const result = await exportArchive({
          outputPath,
          format,
          resources,
        })

        const stats = await fs.stat(result.archivePath)
        const sizeKb = (stats.size / 1024).toFixed(1)

        console.log(`\n✓ Export completed successfully!\n`)
        console.log(`  Archive: ${result.archivePath}`)
        console.log(`  Size:    ${sizeKb} KB`)
        console.log(`  Files:   ${result.totalFiles}`)
        console.log()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`\nError: ${message}\n`)
        process.exitCode = 1
      }
    })
}
