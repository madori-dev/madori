/**
 * Markdown scanner module for the migrate:markdown command.
 * Scans a directory for .md files, parses frontmatter with gray-matter,
 * and derives title/slug from filename when no frontmatter is present.
 * Uses an async generator pattern for streaming consumption.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'

export interface ScannedFile {
  relativePath: string
  frontmatter: Record<string, unknown> | null
  content: string
  title: string
  slug: string
}

/**
 * Derives a display title from a filename.
 * Removes extension, replaces dashes and underscores with spaces, title-cases the result.
 *
 * Examples:
 *   my-blog-post.md → My Blog Post
 *   getting_started.md → Getting Started
 */
export function deriveTitle(filename: string): string {
  const name = filename.replace(/\.md$/i, '')
  const words = name.split(/[-_]/)
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Derives a URL slug from a filename.
 * Removes extension, lowercases, replaces spaces and underscores with dashes,
 * strips non-alphanumeric characters except dashes.
 *
 * Examples:
 *   My Blog Post.md → my-blog-post
 *   getting_started.md → getting-started
 */
export function deriveSlug(filename: string): string {
  const name = filename.replace(/\.md$/i, '')
  return name
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

/**
 * Recursively walks a directory yielding paths to all .md files.
 */
async function* walkMarkdownFiles(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      yield* walkMarkdownFiles(fullPath)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      yield fullPath
    }
  }
}

/**
 * Async generator that recursively scans a source directory for .md files,
 * parses each with gray-matter, and yields ScannedFile objects.
 *
 * - If frontmatter has `title` → uses it. Otherwise → derives from filename.
 * - If frontmatter has `slug` → uses it. Otherwise → derives from filename.
 */
export async function* scanMarkdownFiles(sourceDirectory: string): AsyncGenerator<ScannedFile> {
  const resolvedDir = path.resolve(sourceDirectory)

  for await (const filePath of walkMarkdownFiles(resolvedDir)) {
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed = matter(raw)

    const relativePath = path.relative(resolvedDir, filePath)
    const filename = path.basename(filePath)

    const hasFrontmatter = parsed.data && Object.keys(parsed.data).length > 0
    const frontmatter = hasFrontmatter ? (parsed.data as Record<string, unknown>) : null

    const title = (typeof frontmatter?.title === 'string' && frontmatter.title)
      ? frontmatter.title
      : deriveTitle(filename)

    const slug = (typeof frontmatter?.slug === 'string' && frontmatter.slug)
      ? frontmatter.slug
      : deriveSlug(filename)

    yield {
      relativePath,
      frontmatter,
      content: parsed.content,
      title,
      slug,
    }
  }
}
