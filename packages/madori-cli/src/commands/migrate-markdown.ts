import type { Command } from 'commander'
import { input } from '@inquirer/prompts'
import { scanMarkdownFiles } from '../migration/markdown-scanner.js'
import { createStreamingProcessor } from '../migration/streaming-processor.js'
import { yamlWriter } from '../utils/yaml-writer.js'
import { resolveProjectPath } from '../utils/resolve-paths.js'
import type { ScannedFile } from '../migration/markdown-scanner.js'
import * as path from 'path'

interface TransformedEntry {
  filePath: string
  frontmatter: Record<string, unknown>
  content: string
}

function transformScannedFile(scannedFile: ScannedFile, collection: string): TransformedEntry {
  const now = new Date().toISOString()
  const filePath = resolveProjectPath('content', 'collections', collection, `${scannedFile.slug}.md`)

  const frontmatter: Record<string, unknown> = {
    ...(scannedFile.frontmatter ?? {}),
    title: scannedFile.title,
    slug: scannedFile.slug,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  }

  return { filePath, frontmatter, content: scannedFile.content }
}

export function registerMigrateMarkdown(program: Command): void {
  program
    .command('migrate:markdown <source-directory>')
    .description('Migrate Markdown files from a directory into a Madori collection')
    .option('--collection <handle>', 'Target collection handle (prompted if not provided)')
    .action(async (sourceDirectory: string, options: { collection?: string }) => {
      let collection = options.collection

      if (!collection) {
        collection = await input({ message: 'Target collection handle:' })
      }

      if (!collection) {
        console.error('Error: A collection handle is required.')
        process.exitCode = 1
        return
      }

      const resolvedSource = path.resolve(sourceDirectory)

      console.log(`Migrating Markdown files from: ${resolvedSource}`)
      console.log(`Target collection: ${collection}`)
      console.log('')

      const warnings: string[] = []
      const processor = createStreamingProcessor<ScannedFile, TransformedEntry>()
      const source = scanMarkdownFiles(resolvedSource)

      const transform = (item: ScannedFile): TransformedEntry => {
        return transformScannedFile(item, collection)
      }

      const sink = async (batch: TransformedEntry[]): Promise<void> => {
        for (const entry of batch) {
          try {
            await yamlWriter.writeEntry(entry.filePath, entry.frontmatter, entry.content)
          } catch (err) {
            warnings.push(
              `Failed to write ${entry.filePath}: ${err instanceof Error ? err.message : String(err)}`
            )
          }
        }
      }

      let result
      try {
        result = await processor.process(source, transform, sink, { batchSize: 100 })
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`
        )
        process.exitCode = 1
        return
      }

      const allWarnings = [...warnings, ...result.errors.map((e) => `${e.item}: ${e.error}`)]

      console.log('Migration complete!')
      console.log('')
      console.log(`  Files processed:  ${result.totalProcessed}`)
      console.log(`  Entries created:  ${result.totalSuccess}`)
      console.log(`  Skipped:          ${result.totalSkipped}`)

      if (allWarnings.length > 0) {
        console.log('')
        console.log('Warnings:')
        for (const warning of allWarnings) {
          console.log(`  ⚠ ${warning}`)
        }
      }

      console.log('')
      console.log(
        `Summary: ${result.totalProcessed} processed, ${result.totalSuccess} created, ${result.totalSkipped} skipped, ${allWarnings.length} warnings`
      )
    })
}
