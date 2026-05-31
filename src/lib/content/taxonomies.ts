import * as path from 'path'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'
import type { ContentCache } from '@/lib/cache/store'
import type { MadoriConfig } from '@/lib/config/schema'
import type { Taxonomy, Term } from '@/lib/types'
import { NotFoundError } from '@/lib/errors'

/**
 * Taxonomy and Term operations for the Content Engine.
 *
 * - getTaxonomy / listTaxonomies discover definitions from resources/taxonomies/
 * - getTerm / listTerms read YAML files from content/taxonomies/{handle}/
 */
export class TaxonomyOperations {
  constructor(
    private readonly config: MadoriConfig,
    private readonly fs: FileSystemAdapter,
    private readonly parser: ContentParser,
    private readonly cache: ContentCache
  ) {}

  async getTaxonomy(handle: string): Promise<Taxonomy | null> {
    const cacheKey = `taxonomy:${handle}`
    const cached = this.cache.get<Taxonomy>(cacheKey)
    if (cached) return cached

    // Read taxonomy definition from resources/taxonomies/{handle}.yaml
    const defPath = path.join(this.config.resourcesPath, 'taxonomies', `${handle}.yaml`)
    const exists = await this.fs.exists(defPath)
    if (!exists) return null

    const raw = await this.fs.readFile(defPath)
    const data = this.parser.parseYaml<Record<string, unknown>>(raw)

    const taxonomy: Taxonomy = {
      handle,
      title: (data.title as string) ?? handle,
      blueprint: data.blueprint as string | undefined,
    }

    this.cache.set(cacheKey, taxonomy)
    return taxonomy
  }

  async listTaxonomies(): Promise<Taxonomy[]> {
    const cacheKey = 'taxonomies:all'
    const cached = this.cache.get<Taxonomy[]>(cacheKey)
    if (cached) return cached

    const dirPath = path.join(this.config.resourcesPath, 'taxonomies')
    const dirExists = await this.fs.exists(dirPath)
    if (!dirExists) return []

    const files = await this.fs.listFiles(dirPath, '*.yaml')
    const taxonomies: Taxonomy[] = []

    for (const file of files) {
      const handle = path.basename(file, '.yaml')
      const taxonomy = await this.getTaxonomy(handle)
      if (taxonomy) taxonomies.push(taxonomy)
    }

    this.cache.set(cacheKey, taxonomies)
    return taxonomies
  }

  async getTerm(taxonomy: string, slug: string): Promise<Term | null> {
    const cacheKey = `term:${taxonomy}:${slug}`
    const cached = this.cache.get<Term>(cacheKey)
    if (cached) return cached

    // Verify taxonomy exists
    const taxonomyDef = await this.getTaxonomy(taxonomy)
    if (!taxonomyDef) {
      throw new NotFoundError('Taxonomy', taxonomy)
    }

    const filePath = this.termFilePath(taxonomy, slug)
    const exists = await this.fs.exists(filePath)
    if (!exists) return null

    const raw = await this.fs.readFile(filePath)
    const data = this.parser.parseYaml<Record<string, unknown>>(raw)

    const term = this.dataToTerm(data, taxonomy, slug)
    this.cache.set(cacheKey, term, [filePath])
    return term
  }

  async listTerms(taxonomy: string): Promise<Term[]> {
    const cacheKey = `terms:${taxonomy}`
    const cached = this.cache.get<Term[]>(cacheKey)
    if (cached) return cached

    // Verify taxonomy exists
    const taxonomyDef = await this.getTaxonomy(taxonomy)
    if (!taxonomyDef) {
      throw new NotFoundError('Taxonomy', taxonomy)
    }

    const dirPath = this.taxonomyDirPath(taxonomy)
    const dirExists = await this.fs.exists(dirPath)
    if (!dirExists) return []

    const files = await this.fs.listFiles(dirPath, '*.yaml')
    const terms: Term[] = []

    for (const file of files) {
      const slug = path.basename(file, '.yaml')
      const filePath = path.join(dirPath, file)
      const raw = await this.fs.readFile(filePath)
      const data = this.parser.parseYaml<Record<string, unknown>>(raw)
      terms.push(this.dataToTerm(data, taxonomy, slug))
    }

    // Cache with invalidation tied to the taxonomy directory
    this.cache.set(cacheKey, terms)
    return terms
  }

  private dataToTerm(
    data: Record<string, unknown>,
    taxonomy: string,
    slug: string
  ): Term {
    const { title, description, slug: _slug, ...rest } = data
    return {
      title: (title as string) ?? slug,
      slug: (_slug as string) ?? slug,
      taxonomy,
      description: description as string | undefined,
      data: rest,
    }
  }

  private taxonomyDirPath(taxonomy: string): string {
    return path.join(this.config.contentPath, 'taxonomies', taxonomy)
  }

  private termFilePath(taxonomy: string, slug: string): string {
    return path.join(this.config.contentPath, 'taxonomies', taxonomy, `${slug}.yaml`)
  }
}
