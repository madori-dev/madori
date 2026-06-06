import type { Command } from 'commander'
import { parseWxrFile } from '../migration/wordpress-parser.js'
import { htmlToMarkdown } from '../migration/html-to-markdown.js'
import { createStreamingProcessor } from '../migration/streaming-processor.js'
import { yamlWriter } from '../utils/yaml-writer.js'
import { resolveProjectPath } from '../utils/resolve-paths.js'
import type { WxrItem } from '../migration/wordpress-parser.js'
import { stringify } from 'yaml'
import * as fs from 'fs/promises'
import * as path from 'path'

interface TransformedEntry {
  filePath: string
  frontmatter: Record<string, unknown>
  content: string
}

interface TaxonomyData {
  categories: Set<string>
  tags: Set<string>
}

function mapStatus(wpStatus: string): string {
  switch (wpStatus) {
    case 'publish':
      return 'published'
    case 'draft':
      return 'draft'
    case 'private':
      return 'draft'
    default:
      return 'draft'
  }
}

function transformItem(item: WxrItem, collectionOverride?: string): TransformedEntry {
  const markdownContent = htmlToMarkdown(item.content)

  const collection = collectionOverride ?? (item.type === 'page' ? 'pages' : 'posts')
  const filePath = resolveProjectPath('content', 'collections', collection, `${item.slug}.md`)

  const frontmatter: Record<string, unknown> = {
    title: item.title,
    slug: item.slug,
    status: mapStatus(item.status),
    createdAt: item.pubDate,
    updatedAt: item.pubDate,
    author: item.author,
  }

  if (item.categories.length > 0) {
    frontmatter.categories = item.categories
  }

  if (item.tags.length > 0) {
    frontmatter.tags = item.tags
  }

  return { filePath, frontmatter, content: markdownContent }
}

async function writeTaxonomies(taxonomyData: TaxonomyData): Promise<void> {
  const taxonomiesDir = resolveProjectPath('resources', 'taxonomies')
  await fs.mkdir(taxonomiesDir, { recursive: true })

  if (taxonomyData.categories.size > 0) {
    const categoriesPath = path.join(taxonomiesDir, 'categories.yaml')
    const categoriesContent = stringify({
      title: 'Categories',
      terms: Array.from(taxonomyData.categories).map((name) => ({
        handle: name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        title: name,
      })),
    })
    await fs.writeFile(categoriesPath, categoriesContent, 'utf-8')
  }

  if (taxonomyData.tags.size > 0) {
    const tagsPath = path.join(taxonomiesDir, 'tags.yaml')
    const tagsContent = stringify({
      title: 'Tags',
      terms: Array.from(taxonomyData.tags).map((name) => ({
        handle: name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        title: name,
      })),
    })
    await fs.writeFile(tagsPath, tagsContent, 'utf-8')
  }
}

export function registerMigrateWordpress(program: Command): void {
  program
    .command('migrate:wordpress <export-file>')
    .description('Migrate content from a WordPress WXR export file into Madori entries')
    .option('--collection <handle>', 'Target collection handle (default: posts for posts, pages for pages)')
    .action(async (exportFile: string, options: { collection?: string }) => {
      const resolvedPath = path.resolve(exportFile)

      console.log(`Migrating WordPress content from: ${resolvedPath}`)
      console.log('')

      const taxonomyData: TaxonomyData = {
        categories: new Set(),
        tags: new Set(),
      }

      const warnings: string[] = []

      const processor = createStreamingProcessor<WxrItem, TransformedEntry>()

      const source = parseWxrFile(resolvedPath)

      // Collect taxonomy data during transform
      const transform = (item: WxrItem): TransformedEntry => {
        for (const cat of item.categories) {
          taxonomyData.categories.add(cat)
        }
        for (const tag of item.tags) {
          taxonomyData.tags.add(tag)
        }
        return transformItem(item, options.collection)
      }

      // Sink: write each entry to disk
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

      // Write taxonomy files
      await writeTaxonomies(taxonomyData)

      // Display summary
      const allWarnings = [...warnings, ...result.errors.map((e) => `${e.item}: ${e.error}`)]

      console.log('Migration complete!')
      console.log('')
      console.log(`  Total processed: ${result.totalProcessed}`)
      console.log(`  Entries created:  ${result.totalSuccess}`)
      console.log(`  Skipped:          ${result.totalSkipped}`)

      if (taxonomyData.categories.size > 0 || taxonomyData.tags.size > 0) {
        console.log('')
        console.log('Taxonomies:')
        if (taxonomyData.categories.size > 0) {
          console.log(`  Categories: ${taxonomyData.categories.size} terms → resources/taxonomies/categories.yaml`)
        }
        if (taxonomyData.tags.size > 0) {
          console.log(`  Tags:       ${taxonomyData.tags.size} terms → resources/taxonomies/tags.yaml`)
        }
      }

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
