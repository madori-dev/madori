import { z } from 'zod'

/**
 * @deprecated CollectionConfigSchema is retained for backward compatibility
 * with existing code that references collection configs. Collections are now
 * managed via flat files under resources/blueprints/collections/.
 */
export const CollectionConfigSchema = z.object({
  title: z.string(),
  handle: z.string(),
  route: z.string().optional(),
  blueprint: z.string(),
  sortable: z.boolean().optional(),
  dated: z.boolean().optional(),
  defaultStatus: z.enum(['published', 'draft']).optional(),
  icon: z.string().optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
  template: z.string().optional(),
  layout: z.string().optional(),
  taxonomies: z.array(z.string()).optional(),
  redirects: z.object({
    create: z.string().optional(),
    '404': z.string().optional(),
  }).optional(),
  blueprints: z.array(z.string()).optional(),
})

/**
 * @deprecated TaxonomyConfigSchema is retained for backward compatibility.
 * Taxonomies are now defined as flat files under resources/taxonomies/.
 */
export const TaxonomyConfigSchema = z.object({
  handle: z.string(),
  title: z.string(),
  blueprint: z.string().optional(),
})

/**
 * @deprecated GlobalConfigSchema is retained for backward compatibility.
 * Globals are now defined as flat files under resources/globals/.
 */
export const GlobalConfigSchema = z.object({
  handle: z.string(),
  title: z.string(),
  blueprint: z.string().optional(),
})

export const AuthConfigSchema = z.object({
  driver: z.string().default('password'),
  store: z.string().default('file'),
  provider: z.string().default('yaml'),
  driverConfig: z.record(z.string(), z.unknown()).optional(),
  storeConfig: z.record(z.string(), z.unknown()).optional(),
  providerConfig: z.record(z.string(), z.unknown()).optional(),
}).default(() => ({
  driver: 'password',
  store: 'file',
  provider: 'yaml',
}))

/**
 * Properties that have been removed from the config schema.
 * Used for deprecation detection at startup.
 */
export const DEPRECATED_CONFIG_PROPERTIES = [
  'collections',
  'taxonomies',
  'globals',
  'navigations',
] as const

export const MadoriConfigSchema = z.object({
  contentPath: z.string().default('./content'),
  resourcesPath: z.string().default('./resources'),
  usersPath: z.string().default('./users'),
  assetsPath: z.string().default('./public/assets'),

  cp: z
    .object({
      enabled: z.boolean().default(true),
      path: z.string().default('/cp'),
    })
    .default(() => ({ enabled: true, path: '/cp' })),

  graphql: z
    .object({
      enabled: z.boolean().default(true),
      path: z.string().default('/api/graphql'),
      introspection: z.boolean().default(process.env.NODE_ENV !== 'production'),
    })
    .default(() => ({
      enabled: true,
      path: '/api/graphql',
      introspection: process.env.NODE_ENV !== 'production',
    })),

  auth: AuthConfigSchema,
})

export type MadoriConfig = z.infer<typeof MadoriConfigSchema>
export type MadoriConfigInput = z.input<typeof MadoriConfigSchema>
export type AuthConfig = z.infer<typeof AuthConfigSchema>
export type CollectionConfig = z.infer<typeof CollectionConfigSchema>
export type TaxonomyConfig = z.infer<typeof TaxonomyConfigSchema>
export type GlobalConfig = z.infer<typeof GlobalConfigSchema>
