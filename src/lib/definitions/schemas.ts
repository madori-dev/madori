import { z } from 'zod'
import type { EntityType } from './errors'

export const CollectionDefinitionSchema = z.object({
  title: z.string(),
  blueprint: z.string(),
  route: z.string().optional(),
  sortable: z.boolean().optional(),
  dated: z.boolean().optional(),
  defaultStatus: z.enum(['published', 'draft']).optional(),
  icon: z.string().optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
  template: z.string().optional(),
  layout: z.string().optional(),
  taxonomies: z.array(z.string()).optional(),
})

export const TaxonomyDefinitionSchema = z.object({
  title: z.string(),
  blueprint: z.string().optional(),
})

export const GlobalDefinitionSchema = z.object({
  title: z.string(),
  blueprint: z.string().optional(),
})

export const NavigationDefinitionSchema = z.object({
  title: z.string(),
  max_depth: z.number().optional(),
  collections: z.array(z.string()).optional(),
})

export const FormDefinitionSchema = z.object({
  title: z.string(),
  blueprint: z.string().optional(),
  honeypot: z.boolean().optional(),
  store_submissions: z.boolean().optional(),
})

export const DefinitionSchemas: Record<EntityType, z.ZodSchema> = {
  collections: CollectionDefinitionSchema,
  taxonomies: TaxonomyDefinitionSchema,
  globals: GlobalDefinitionSchema,
  navigations: NavigationDefinitionSchema,
  forms: FormDefinitionSchema,
}

export type CollectionDefinition = z.infer<typeof CollectionDefinitionSchema>
export type TaxonomyDefinition = z.infer<typeof TaxonomyDefinitionSchema>
export type GlobalDefinition = z.infer<typeof GlobalDefinitionSchema>
export type NavigationDefinition = z.infer<typeof NavigationDefinitionSchema>
export type FormDefinition = z.infer<typeof FormDefinitionSchema>
