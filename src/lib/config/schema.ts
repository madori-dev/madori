import { z } from 'zod'

const CollectionRouteSchema = z.string().startsWith('/', 'Route must start with "/"').refine(
  (route) => route.includes('{slug}'), 'Route must include the {slug} placeholder'
).refine((route) => [...route.matchAll(/\{([^}]+)\}/g)].every((match) => ['slug', 'collection', 'parent_uri'].includes(match[1])), 'Route contains an unsupported placeholder')

/**
 * @deprecated CollectionConfigSchema is retained for backward compatibility
 * with existing code that references collection configs. Collections are now
 * managed via flat files under resources/blueprints/collections/.
 */
export const CollectionConfigSchema = z.object({
  title: z.string(),
  handle: z.string(),
  route: CollectionRouteSchema.optional(),
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
  route: z.string().optional(),
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

export const InvalidationRuleSchema = z.object({
  trigger: z.string(), // collection handle or resource type
  urls: z.array(z.string()), // explicit paths or glob patterns
})

export const StaticCacheConfigSchema = z.object({
  enabled: z.boolean().default(false),
  driver: z.enum(['application', 'file']).default('application'),
  storagePath: z.string().default('storage/static-cache/'),
  exclude: z.array(z.string()).default([]),
  queryStrings: z.enum(['ignore', 'separate']).default('ignore'),
  warmOnInvalidate: z.boolean().default(false),
  invalidationRules: z.array(InvalidationRuleSchema).default([]),
})

const GitPathSchema = z.string().trim().min(1).refine((value) => !value.includes('\0'), {
  message: 'Git paths cannot contain null bytes',
})

export const GitTrackedPathSchema = z.object({
  /** Built-in content roots or an explicit path (including external repositories). */
  root: z.union([
    z.enum(['content', 'resources', 'assets', 'users']),
    GitPathSchema,
  ]),
  exclude: z.array(GitPathSchema).default([]),
})

export const GitConfigSchema = z.object({
  enabled: z.boolean().default(false),
  automatic: z.boolean().default(true),
  push: z.boolean().default(false),
  debounceMs: z.number().int().nonnegative().default(2000),
  trackedPaths: z.array(GitTrackedPathSchema).default([
    { root: 'content', exclude: ['forms/**'] },
    { root: 'resources', exclude: [] },
  ]),
  remote: z.string().trim().min(1).default('origin'),
  branch: z.string().trim().min(1).optional(),
  author: z.object({
    useAuthenticated: z.boolean().default(true),
    name: z.string().trim().min(1).default('Madori'),
    email: z.string().trim().min(1).default('madori@localhost'),
  }).default(() => ({
    useAuthenticated: true,
    name: 'Madori',
    email: 'madori@localhost',
  })),
  commitPrefix: z.string().trim().min(1).refine((value) => !/[\r\n]/.test(value), {
    message: 'Commit prefix cannot contain newlines',
  }).default('[Madori]'),
  commandTimeoutMs: z.number().int().positive().default(30_000),
  lockTimeoutMs: z.number().int().positive().default(120_000),
  statePath: GitPathSchema.default('./storage/git-sync'),
})

const PublicSiteUrlSchema = z.url().refine((value) => {
  try {
    const parsed = new URL(value)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && !parsed.username
      && !parsed.password
      && !parsed.search
      && !parsed.hash
  } catch {
    return false
  }
}, 'Site URL must be a public HTTP(S) origin without credentials, query, or fragment')

const PublicOriginSchema = PublicSiteUrlSchema.refine((value) => new URL(value).pathname === '/', {
  message: 'Allowed redirect origin must not include a path',
})

export const SiteDefinitionConfigSchema = z.object({
  handle: z.string().trim().regex(/^[a-z0-9][a-z0-9-]*$/),
  url: PublicSiteUrlSchema,
  locale: z.string().trim().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/),
  default: z.boolean().default(false),
})

export const SeoConfigSchema = z.object({
  enabled: z.boolean().default(true),
  metadata: z.boolean().default(true),
  structuredData: z.boolean().default(true),
  sitemap: z.boolean().default(true),
  robots: z.boolean().default(true),
  humans: z.boolean().default(true),
  reports: z.boolean().default(true),
  redirects: z.boolean().default(true),
  errorTracking: z.boolean().default(true),
  socialImages: z.boolean().default(false),
  allowExternalCanonicals: z.boolean().default(false),
  allowedRedirectOrigins: z.array(PublicOriginSchema).max(100).default([]),
  trailingSlash: z.enum(['always', 'never', 'preserve']).default('never'),
  reportRetentionDays: z.number().int().positive().default(90),
  reportSnapshotLimit: z.number().int().positive().default(50),
  operationalStoragePath: GitPathSchema.default('./storage/seo'),
}).default(() => ({
  enabled: true,
  metadata: true,
  structuredData: true,
  sitemap: true,
  robots: true,
  humans: true,
  reports: true,
  redirects: true,
  errorTracking: true,
  socialImages: false,
  allowExternalCanonicals: false,
  allowedRedirectOrigins: [],
  trailingSlash: 'never' as const,
  reportRetentionDays: 90,
  reportSnapshotLimit: 50,
  operationalStoragePath: './storage/seo',
}))

export const MadoriConfigSchema = z.object({
  contentPath: z.string().default('./content'),
  resourcesPath: z.string().default('./resources'),
  usersPath: z.string().default('./users'),
  assetsPath: z.string().default('./public/assets'),

  sites: z.array(SiteDefinitionConfigSchema).min(1).superRefine((sites, context) => {
    const handles = new Set<string>()
    for (const [index, site] of sites.entries()) {
      if (handles.has(site.handle)) {
        context.addIssue({ code: 'custom', path: [index, 'handle'], message: 'Site handles must be unique' })
      }
      handles.add(site.handle)
    }
    if (sites.filter((site) => site.default).length !== 1) {
      context.addIssue({ code: 'custom', message: 'Exactly one site must be marked as default' })
    }
  }).default([{
    handle: 'default',
    url: 'http://localhost:3000',
    locale: 'en-US',
    default: true,
  }]),

  seo: SeoConfigSchema,

  git: GitConfigSchema.default({
    enabled: false,
    automatic: true,
    push: false,
    debounceMs: 2000,
    trackedPaths: [
      { root: 'content', exclude: ['forms/**'] },
      { root: 'resources', exclude: [] },
    ],
    remote: 'origin',
    author: { useAuthenticated: true, name: 'Madori', email: 'madori@localhost' },
    commitPrefix: '[Madori]',
    commandTimeoutMs: 30_000,
    lockTimeoutMs: 120_000,
    statePath: './storage/git-sync',
  }),

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

  staticCache: StaticCacheConfigSchema.default({
    enabled: false,
    driver: 'application',
    storagePath: 'storage/static-cache/',
    exclude: [],
    queryStrings: 'ignore',
    warmOnInvalidate: false,
    invalidationRules: [],
  }),
})

export type MadoriConfig = z.infer<typeof MadoriConfigSchema>
export type MadoriConfigInput = z.input<typeof MadoriConfigSchema>
export type AuthConfig = z.infer<typeof AuthConfigSchema>
export type StaticCacheConfig = z.infer<typeof StaticCacheConfigSchema>
export type GitConfig = z.infer<typeof GitConfigSchema>
export type GitTrackedPath = z.infer<typeof GitTrackedPathSchema>
export type SiteDefinitionConfig = z.infer<typeof SiteDefinitionConfigSchema>
export type SeoConfig = z.infer<typeof SeoConfigSchema>
export type InvalidationRule = z.infer<typeof InvalidationRuleSchema>
export type CollectionConfig = z.infer<typeof CollectionConfigSchema>
export type TaxonomyConfig = z.infer<typeof TaxonomyConfigSchema>
export type GlobalConfig = z.infer<typeof GlobalConfigSchema>
