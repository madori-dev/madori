import { describe, it, expect } from 'vitest'
import { GraphQLSDKGenerator } from '../graphql-sdk-generator.js'
import type { Blueprint } from '@madori/lib/blueprints/types.js'

describe('GraphQLSDKGenerator', () => {
  let generator: GraphQLSDKGenerator

  beforeEach(() => {
    generator = new GraphQLSDKGenerator()
  })

  describe('generate', () => {
    it('returns empty array for no blueprints', async () => {
      const result = await generator.generate([])
      expect(result).toEqual([])
    })

    it('produces client.ts, per-collection operation files, and barrel', async () => {
      const blueprints: Blueprint[] = [
        { handle: 'blog', tabs: { main: { fields: [{ handle: 'title', field: { type: 'text' } }] } } },
        { handle: 'pages', tabs: { main: { fields: [{ handle: 'body', field: { type: 'tiptap' } }] } } },
      ]
      const result = await generator.generate(blueprints)

      expect(result).toHaveLength(4) // client + 2 operations + barrel
      expect(result[0].filename).toBe('graphql/client.ts')
      expect(result[1].filename).toBe('graphql/blog-operations.ts')
      expect(result[2].filename).toBe('graphql/pages-operations.ts')
      expect(result[3].filename).toBe('graphql/index.ts')
    })

    it('sets blueprintHandle on operation files', async () => {
      const blueprints: Blueprint[] = [
        { handle: 'blog', tabs: { main: { fields: [{ handle: 'title', field: { type: 'text' } }] } } },
      ]
      const result = await generator.generate(blueprints)
      const opFile = result.find((f) => f.filename === 'graphql/blog-operations.ts')
      expect(opFile?.blueprintHandle).toBe('blog')
    })
  })

  describe('generateClient', () => {
    it('exports TypedDocumentNode type', () => {
      const result = generator.generateClient()
      expect(result.content).toContain('export type TypedDocumentNode<TResult, TVariables>')
    })

    it('exports GraphQLClientConfig interface', () => {
      const result = generator.generateClient()
      expect(result.content).toContain('export interface GraphQLClientConfig')
      expect(result.content).toContain('endpoint: string')
      expect(result.content).toContain('headers?: Record<string, string>')
    })

    it('exports configureGraphQL function', () => {
      const result = generator.generateClient()
      expect(result.content).toContain('export function configureGraphQL(options: Partial<GraphQLClientConfig>): void')
    })

    it('exports typed request function', () => {
      const result = generator.generateClient()
      expect(result.content).toContain('export async function request<TResult, TVariables extends Record<string, unknown>>')
      expect(result.content).toContain('document: TypedDocumentNode<TResult, TVariables>')
      expect(result.content).toContain('Promise<TResult>')
    })

    it('uses /api/graphql as default endpoint', () => {
      const result = generator.generateClient()
      expect(result.content).toContain("endpoint: '/api/graphql'")
    })

    it('uses fetch with POST method and JSON content type', () => {
      const result = generator.generateClient()
      expect(result.content).toContain("method: 'POST'")
      expect(result.content).toContain("'Content-Type': 'application/json'")
    })

    it('throws on GraphQL errors', () => {
      const result = generator.generateClient()
      expect(result.content).toContain('if (json.errors) throw new Error(json.errors[0].message)')
    })

    it('has filename graphql/client.ts', () => {
      const result = generator.generateClient()
      expect(result.filename).toBe('graphql/client.ts')
    })
  })

  describe('generateOperations', () => {
    const blogBlueprint: Blueprint = {
      handle: 'blog',
      tabs: { main: { fields: [{ handle: 'title', field: { type: 'text', required: true } }] } },
    }

    it('imports the collection type from types directory', () => {
      const result = generator.generateOperations(blogBlueprint)
      expect(result.content).toContain("import type { BlogEntry } from '../types/blog.js'")
    })

    it('imports TypedDocumentNode and request from client', () => {
      const result = generator.generateOperations(blogBlueprint)
      expect(result.content).toContain("import type { TypedDocumentNode } from './client.js'")
      expect(result.content).toContain("import { request } from './client.js'")
    })

    it('exports ListOptions interface', () => {
      const result = generator.generateOperations(blogBlueprint)
      expect(result.content).toContain('export interface ListOptions')
      expect(result.content).toContain('limit?: number')
      expect(result.content).toContain('offset?: number')
      expect(result.content).toContain('sort?: string')
      expect(result.content).toContain("order?: 'asc' | 'desc'")
    })

    it('exports Get{PascalCase}EntryDocument with correct typing', () => {
      const result = generator.generateOperations(blogBlueprint)
      expect(result.content).toContain('export const GetBlogEntryDocument')
      expect(result.content).toContain('TypedDocumentNode<{ blogEntry: BlogEntry | null }, { slug: string }>')
    })

    it('exports List{PascalCase}EntriesDocument with correct typing', () => {
      const result = generator.generateOperations(blogBlueprint)
      expect(result.content).toContain('export const ListBlogEntriesDocument')
      expect(result.content).toContain('TypedDocumentNode<{ blogEntries: BlogEntry[] }, { options?: ListOptions }>')
    })

    it('exports get{PascalCase}Entry function that takes slug and returns entry or null', () => {
      const result = generator.generateOperations(blogBlueprint)
      expect(result.content).toContain('export async function getBlogEntry(slug: string): Promise<BlogEntry | null>')
      expect(result.content).toContain('return result.blogEntry')
    })

    it('exports list{PascalCase}Entries function that takes options and returns array', () => {
      const result = generator.generateOperations(blogBlueprint)
      expect(result.content).toContain('export async function listBlogEntries(options?: ListOptions): Promise<BlogEntry[]>')
      expect(result.content).toContain('return result.blogEntries')
    })

    it('uses request function with document nodes in operation functions', () => {
      const result = generator.generateOperations(blogBlueprint)
      expect(result.content).toContain('await request(GetBlogEntryDocument, { slug })')
      expect(result.content).toContain('await request(ListBlogEntriesDocument, { options })')
    })

    it('handles kebab-case handles with PascalCase conversion', () => {
      const blueprint: Blueprint = {
        handle: 'getting-started',
        tabs: { main: { fields: [{ handle: 'title', field: { type: 'text' } }] } },
      }
      const result = generator.generateOperations(blueprint)

      expect(result.content).toContain("import type { GettingStartedEntry } from '../types/getting-started.js'")
      expect(result.content).toContain('export const GetGettingStartedEntryDocument')
      expect(result.content).toContain('export const ListGettingStartedEntriesDocument')
      expect(result.content).toContain('export async function getGettingStartedEntry')
      expect(result.content).toContain('export async function listGettingStartedEntries')
    })

    it('generates valid document node structure with kind Document', () => {
      const result = generator.generateOperations(blogBlueprint)
      expect(result.content).toContain("kind: 'Document'")
      expect(result.content).toContain("kind: 'OperationDefinition'")
      expect(result.content).toContain("operation: 'query'")
    })

    it('sets correct filename for operation file', () => {
      const result = generator.generateOperations(blogBlueprint)
      expect(result.filename).toBe('graphql/blog-operations.ts')
    })
  })

  describe('generateBarrel', () => {
    it('re-exports client module', () => {
      const blueprints: Blueprint[] = [
        { handle: 'blog', tabs: { main: { fields: [] } } },
      ]
      const result = generator.generateBarrel(blueprints)
      expect(result.content).toContain("export * from './client.js'")
    })

    it('re-exports all collection operation files', () => {
      const blueprints: Blueprint[] = [
        { handle: 'blog', tabs: { main: { fields: [] } } },
        { handle: 'pages', tabs: { main: { fields: [] } } },
      ]
      const result = generator.generateBarrel(blueprints)
      expect(result.content).toContain("export * from './blog-operations.js'")
      expect(result.content).toContain("export * from './pages-operations.js'")
    })

    it('barrel ends with a newline', () => {
      const blueprints: Blueprint[] = [
        { handle: 'blog', tabs: { main: { fields: [] } } },
      ]
      const result = generator.generateBarrel(blueprints)
      expect(result.content).toMatch(/\n$/)
    })

    it('has filename graphql/index.ts', () => {
      const blueprints: Blueprint[] = [
        { handle: 'blog', tabs: { main: { fields: [] } } },
      ]
      const result = generator.generateBarrel(blueprints)
      expect(result.filename).toBe('graphql/index.ts')
    })
  })

  describe('graceful handling', () => {
    it('generate is an async function that resolves immediately', async () => {
      const blueprints: Blueprint[] = [
        { handle: 'blog', tabs: { main: { fields: [{ handle: 'title', field: { type: 'text' } }] } } },
      ]
      const result = generator.generate(blueprints)
      expect(result).toBeInstanceOf(Promise)
      await expect(result).resolves.toBeDefined()
    })
  })
})
