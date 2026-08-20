import { z } from 'zod'
import { SEO_DOCUMENT_VERSION, type SeoDocument, type SeoItemValues, type SeoValues } from './types'

const SafeTextSchema = z.string().trim().min(1).max(2_000).refine(value => !value.includes('\0') && !/[\r\n]/.test(value), 'Must be single-line text')
const HandleSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'Invalid handle')
const TokenTemplateSchema = z.string().trim().min(1).max(4_000).refine(value => !value.includes('\0'), 'Must not contain null bytes')
const MAX_JSON_LD_DEPTH = 8
const MAX_JSON_LD_KEYS = 200
const MAX_JSON_LD_STRING_BYTES = 32 * 1024
const textEncoder = new TextEncoder()

const JsonLdCustomSchema = z.record(z.string().min(1).max(128), z.unknown()).superRefine((value, context) => {
  let keys = 0
  let bytes = 0
  const visit = (item: unknown, depth: number): void => {
    if (depth > MAX_JSON_LD_DEPTH) {
      context.addIssue({ code: 'custom', message: `Custom JSON-LD exceeds maximum depth of ${MAX_JSON_LD_DEPTH}` })
      return
    }
    if (typeof item === 'string') {
      bytes += textEncoder.encode(item).byteLength
      return
    }
    if (Array.isArray(item)) {
      for (const child of item) visit(child, depth + 1)
      return
    }
    if (item && typeof item === 'object') {
      for (const [key, child] of Object.entries(item as Record<string, unknown>)) {
        keys++
        bytes += textEncoder.encode(key).byteLength
        visit(child, depth + 1)
      }
    }
  }
  visit(value, 0)
  if (keys > MAX_JSON_LD_KEYS) context.addIssue({ code: 'custom', message: `Custom JSON-LD exceeds maximum key count of ${MAX_JSON_LD_KEYS}` })
  if (bytes > MAX_JSON_LD_STRING_BYTES) context.addIssue({ code: 'custom', message: 'Custom JSON-LD exceeds maximum string size' })
})

export const SeoSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('inherit') }),
  z.object({ kind: z.literal('disabled') }),
  z.object({ kind: z.literal('literal'), value: SafeTextSchema }),
  z.object({ kind: z.literal('field'), value: HandleSchema }),
  z.object({ kind: z.literal('template'), value: TokenTemplateSchema }),
])

export const SeoRobotsSchema = z.object({
  indexing: z.enum(['index', 'noindex']).optional(),
  following: z.enum(['follow', 'nofollow']).optional(),
  noarchive: z.boolean().optional(),
  noimageindex: z.boolean().optional(),
  nosnippet: z.boolean().optional(),
}).strict()

export const SeoSocialSchema = z.object({
  image: SeoSourceSchema.optional(), imageAlt: SeoSourceSchema.optional(),
  twitterCard: z.enum(['summary', 'summary_large_image']).optional(),
  twitterSite: SafeTextSchema.optional(), twitterCreator: SafeTextSchema.optional(),
}).strict()

export const SeoSitemapSchema = z.object({
  enabled: z.boolean().optional(), priority: z.number().min(0).max(1).optional(),
  changeFrequency: z.enum(['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never']).optional(),
}).strict()

export const SeoJsonLdSchema = z.object({
  enabled: z.boolean().optional(),
  type: z.enum(['WebPage', 'Article', 'Organization', 'Person', 'BreadcrumbList', 'custom']).optional(),
  custom: JsonLdCustomSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.type === 'custom' && !value.custom) context.addIssue({ code: 'custom', message: 'Custom JSON-LD requires custom value', path: ['custom'] })
})

export const SeoValuesSchema = z.object({
  enabled: z.boolean().optional(), title: SeoSourceSchema.optional(), description: SeoSourceSchema.optional(), canonical: SeoSourceSchema.optional(),
  robots: SeoRobotsSchema.optional(), social: SeoSocialSchema.optional(), sitemap: SeoSitemapSchema.optional(), jsonLd: SeoJsonLdSchema.optional(),
}).strict()

export const SeoItemValuesSchema: z.ZodType<SeoItemValues> = SeoValuesSchema
export const SeoSiteDocumentSchema = z.object({ version: z.literal(SEO_DOCUMENT_VERSION), kind: z.literal('site'), site: HandleSchema, seo: SeoValuesSchema }).strict()
export const SeoSectionDocumentSchema = z.object({ version: z.literal(SEO_DOCUMENT_VERSION), kind: z.literal('section'), section: z.enum(['collection', 'taxonomy']), handle: HandleSchema, seo: SeoValuesSchema }).strict()
export const SeoDocumentSchema: z.ZodType<SeoDocument> = z.discriminatedUnion('kind', [SeoSiteDocumentSchema, SeoSectionDocumentSchema])

export function parseSeoValues(value: unknown): SeoValues { return SeoValuesSchema.parse(value) }
export function parseSeoDocument(value: unknown): SeoDocument { return SeoDocumentSchema.parse(value) }
