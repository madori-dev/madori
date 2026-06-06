import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import matter from 'gray-matter'
import { parse as parseYaml } from 'yaml'

/** Generated for asset fields */
export interface MadoriAsset {
  path: string
  filename: string
  extension: string
  size: number
  mimeType: string
  modifiedAt: string
  alt?: string
}

/** Generated for entries relation fields */
export interface MadoriEntryRef {
  collection: string
  slug: string
}

/** Base entry metadata included in all generated types */
export interface MadoriEntryMeta {
  title: string
  slug: string
  status: 'published' | 'draft'
  author?: string
  content: string
  collection: string
  createdAt: string
  updatedAt: string
}

/** Configuration for creating a Madori client */
export interface MadoriClientConfig {
  contentPath: string
  resourcesPath: string
}

/** Options for listing entries */
export interface ListOptions {
  sort?: string
  filter?: Record<string, unknown>
  limit?: number
  offset?: number
  status?: 'published' | 'draft' | 'all'
}

/** Placeholder type for collection metadata */
export interface Collection {
  handle: string
  title: string
  blueprintPath?: string
}

/** Placeholder type for taxonomy metadata */
export interface Taxonomy {
  handle: string
  title: string
  terms: Term[]
}

/** Placeholder type for taxonomy term */
export interface Term {
  slug: string
  title: string
  taxonomy: string
}

/** Typed client interface for querying Madori content */
export interface TypedMadoriClient<TCollections extends Record<string, unknown>> {
  getEntry<K extends keyof TCollections & string>(
    collection: K,
    slug: string
  ): Promise<TCollections[K] | null>

  listEntries<K extends keyof TCollections & string>(
    collection: K,
    options?: ListOptions
  ): Promise<TCollections[K][]>

  getGlobal<T = Record<string, unknown>>(handle: string): Promise<T | null>
  listCollections(): Promise<Collection[]>
  getTaxonomy(handle: string): Promise<Taxonomy | null>
  listTerms(taxonomy: string): Promise<Term[]>
}

/**
 * Parse a markdown file with frontmatter into an entry object.
 */
function parseMarkdownEntry(filePath: string, collection: string): Record<string, unknown> | null {
  try {
    if (!existsSync(filePath)) return null
    const raw = readFileSync(filePath, 'utf-8')
    const { data, content } = matter(raw)
    const slug = basename(filePath, extname(filePath))
    return {
      ...data,
      slug,
      content,
      collection,
    }
  } catch {
    return null
  }
}

/**
 * Parse a YAML file and return its contents.
 */
function parseYamlFile(filePath: string): Record<string, unknown> | null {
  try {
    if (!existsSync(filePath)) return null
    const raw = readFileSync(filePath, 'utf-8')
    const parsed = parseYaml(raw)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

/**
 * List all markdown files in a directory.
 */
function listMarkdownFiles(dirPath: string): string[] {
  try {
    if (!existsSync(dirPath)) return []
    return readdirSync(dirPath)
      .filter((f) => f.endsWith('.md'))
      .map((f) => join(dirPath, f))
  } catch {
    return []
  }
}

/**
 * List all YAML files in a directory.
 */
function listYamlFiles(dirPath: string): string[] {
  try {
    if (!existsSync(dirPath)) return []
    return readdirSync(dirPath)
      .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
      .map((f) => join(dirPath, f))
  } catch {
    return []
  }
}

/**
 * Apply ListOptions filtering, sorting, and pagination to an array of entries.
 */
function applyListOptions<T extends Record<string, unknown>>(
  entries: T[],
  options?: ListOptions
): T[] {
  let result = [...entries]

  // Status filtering (default: published only)
  const statusFilter = options?.status ?? 'published'
  if (statusFilter !== 'all') {
    result = result.filter((entry) => entry.status === statusFilter)
  }

  // Field-based filtering
  if (options?.filter) {
    for (const [key, value] of Object.entries(options.filter)) {
      result = result.filter((entry) => entry[key] === value)
    }
  }

  // Sorting
  if (options?.sort) {
    const descending = options.sort.startsWith('-')
    const field = descending ? options.sort.slice(1) : options.sort

    result.sort((a, b) => {
      const aVal = a[field]
      const bVal = b[field]

      if (aVal === bVal) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      const comparison = String(aVal).localeCompare(String(bVal))
      return descending ? -comparison : comparison
    })
  }

  // Pagination
  const offset = options?.offset ?? 0
  const limit = options?.limit

  if (offset > 0 || limit != null) {
    result = result.slice(offset, limit != null ? offset + limit : undefined)
  }

  return result
}

/**
 * Create a typed Madori content client.
 *
 * Reads content from the file system using the provided config paths.
 * Parses markdown files with frontmatter for entries, YAML for globals and taxonomies.
 */
export function createClient<TCollections extends Record<string, unknown>>(
  config: MadoriClientConfig
): TypedMadoriClient<TCollections> {
  const { contentPath, resourcesPath } = config

  return {
    async getEntry<K extends keyof TCollections & string>(
      collection: K,
      slug: string
    ): Promise<TCollections[K] | null> {
      const filePath = join(contentPath, 'collections', collection, `${slug}.md`)
      const entry = parseMarkdownEntry(filePath, collection)
      return entry as TCollections[K] | null
    },

    async listEntries<K extends keyof TCollections & string>(
      collection: K,
      options?: ListOptions
    ): Promise<TCollections[K][]> {
      const dirPath = join(contentPath, 'collections', collection)
      const files = listMarkdownFiles(dirPath)
      const entries = files
        .map((f) => parseMarkdownEntry(f, collection))
        .filter((e): e is Record<string, unknown> => e !== null)

      return applyListOptions(entries, options) as TCollections[K][]
    },

    async getGlobal<T = Record<string, unknown>>(handle: string): Promise<T | null> {
      const filePath = join(contentPath, 'globals', `${handle}.yaml`)
      const data = parseYamlFile(filePath)
      return data as T | null
    },

    async listCollections(): Promise<Collection[]> {
      const collectionsDir = join(contentPath, 'collections')
      try {
        if (!existsSync(collectionsDir)) return []
        const dirs = readdirSync(collectionsDir).filter((entry) => {
          const fullPath = join(collectionsDir, entry)
          return statSync(fullPath).isDirectory()
        })

        return dirs.map((handle) => {
          // Try to load collection config from resources
          const configPath = join(resourcesPath, 'collections', `${handle}.yaml`)
          const config = parseYamlFile(configPath)
          return {
            handle,
            title: (config?.title as string) ?? handle,
            blueprintPath: config?.blueprint
              ? join(resourcesPath, 'blueprints', 'collections', `${config.blueprint}.yaml`)
              : undefined,
          }
        })
      } catch {
        return []
      }
    },

    async getTaxonomy(handle: string): Promise<Taxonomy | null> {
      const configPath = join(resourcesPath, 'taxonomies', `${handle}.yaml`)
      const config = parseYamlFile(configPath)
      if (!config) return null

      // Load terms from content/taxonomies/{handle}/
      const termsDir = join(contentPath, 'taxonomies', handle)
      const termFiles = listYamlFiles(termsDir)

      const terms: Term[] = termFiles.map((f) => {
        const termData = parseYamlFile(f)
        const slug = basename(f, extname(f))
        return {
          slug,
          title: (termData?.title as string) ?? slug,
          taxonomy: handle,
        }
      })

      return {
        handle,
        title: (config.title as string) ?? handle,
        terms,
      }
    },

    async listTerms(taxonomy: string): Promise<Term[]> {
      const termsDir = join(contentPath, 'taxonomies', taxonomy)
      const termFiles = listYamlFiles(termsDir)

      // Also check for markdown term files
      const mdFiles = listMarkdownFiles(termsDir)
      const allFiles = [...termFiles, ...mdFiles]

      return allFiles.map((f) => {
        const slug = basename(f, extname(f))
        if (f.endsWith('.md')) {
          const entry = parseMarkdownEntry(f, taxonomy)
          return {
            slug,
            title: (entry?.title as string) ?? slug,
            taxonomy,
          }
        }
        const termData = parseYamlFile(f)
        return {
          slug,
          title: (termData?.title as string) ?? slug,
          taxonomy,
        }
      })
    },
  }
}
