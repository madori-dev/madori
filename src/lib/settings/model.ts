import { z } from 'zod'

import {
  MadoriConfigSchema,
  type MadoriConfig,
} from '@/lib/config/schema'

export const RuntimeSettingsSchema = z.object({
  site_name: z.string(),
  locale: z.string(),
  timezone: z.string(),
})

export type RuntimeSettings = z.infer<typeof RuntimeSettingsSchema>

const PublicAuthConfigSchema = z.object({
  driver: z.string(),
  store: z.string(),
  provider: z.string(),
})

/** Complete configuration exposed to and edited by Control Panel browsers. */
export const SettingsConfigSchema = MadoriConfigSchema.pick({
  contentPath: true,
  resourcesPath: true,
  usersPath: true,
  assetsPath: true,
  sites: true,
  seo: true,
  git: true,
  cp: true,
  graphql: true,
  staticCache: true,
}).extend({ auth: PublicAuthConfigSchema })

/** Accepted edit shape. Unknown and server-only values are removed. */
export const SettingsConfigEditSchema = z.object({
  contentPath: z.string().optional(),
  resourcesPath: z.string().optional(),
  usersPath: z.string().optional(),
  assetsPath: z.string().optional(),
  sites: SettingsConfigSchema.shape.sites.optional(),
  seo: SettingsConfigSchema.shape.seo.optional(),
  git: SettingsConfigSchema.shape.git.optional(),
  cp: SettingsConfigSchema.shape.cp.optional(),
  graphql: SettingsConfigSchema.shape.graphql.optional(),
  auth: PublicAuthConfigSchema.partial().optional(),
  staticCache: SettingsConfigSchema.shape.staticCache.optional(),
})

export type SettingsConfig = z.infer<typeof SettingsConfigSchema>
export type SettingsConfigEdit = z.infer<typeof SettingsConfigEditSchema>

type SettingsConfigObject = {
  [K in keyof SettingsConfig]: SettingsConfig[K] extends readonly unknown[]
    ? never
    : SettingsConfig[K] extends object
      ? K
      : never
}[keyof SettingsConfig]

export type SettingsConfigPath = keyof SettingsConfig | {
  [K in SettingsConfigObject]: `${K & string}.${keyof SettingsConfig[K] & string}`
}[SettingsConfigObject]

export interface SettingsValidationResult {
  valid: boolean
  errors: { field: string; message: string }[]
}

const REQUIRED_PATHS = [
  ['contentPath', 'Content Path'],
  ['resourcesPath', 'Resources Path'],
  ['usersPath', 'Users Path'],
  ['assetsPath', 'Assets Path'],
  ['staticCache.storagePath', 'Storage Path'],
] as const

/** Project runtime config through an explicit browser-safe schema. */
export function projectSettingsConfig(config: MadoriConfig): SettingsConfig {
  return SettingsConfigSchema.parse({
    contentPath: config.contentPath,
    resourcesPath: config.resourcesPath,
    usersPath: config.usersPath,
    assetsPath: config.assetsPath,
    sites: config.sites,
    seo: config.seo,
    git: config.git,
    cp: config.cp,
    graphql: config.graphql,
    auth: config.auth,
    staticCache: config.staticCache,
  })
}

/** Strip values that cannot cross Settings module's browser seam. */
export function parseSettingsConfigEdit(input: unknown): SettingsConfigEdit {
  const parsed = SettingsConfigEditSchema.parse(input)
  return retainSubmittedShape(parsed, input as Record<string, unknown>) as SettingsConfigEdit
}

/** Immutable edit for top-level and one-level dotted Settings paths. */
export function updateSettingsConfig(
  config: SettingsConfig,
  fieldPath: SettingsConfigPath,
  value: unknown
): SettingsConfig {
  const [section, field] = fieldPath.split('.')
  if (!field) return { ...config, [section]: value }

  const sectionValue = config[section as keyof SettingsConfig]
  if (!sectionValue || typeof sectionValue !== 'object' || Array.isArray(sectionValue)) {
    throw new Error(`Settings path does not identify an editable field: ${fieldPath}`)
  }

  return {
    ...config,
    [section]: { ...sectionValue, [field]: value },
  }
}

/** Normalize line-oriented controls into persisted lists. */
export function normalizeSettingsLines(value: string): string[] {
  return value.split('\n').map((item) => item.trim()).filter(Boolean)
}

/** Validate path invariants shared by browser feedback and server writes. */
export function validateSettingsPaths(input: unknown): SettingsValidationResult {
  const record = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const errors: SettingsValidationResult['errors'] = []

  for (const [field, label] of REQUIRED_PATHS) {
    const [section, nestedField] = field.split('.')
    const value = nestedField
      ? readNestedValue(record, section, nestedField)
      : record[section]

    // Partial edits need validation only for values they include.
    if (value !== undefined && (typeof value !== 'string' || value.trim() === '')) {
      errors.push({ field, message: `${label} cannot be empty` })
    }
  }

  return { valid: errors.length === 0, errors }
}

export function validationErrorsByPath(result: SettingsValidationResult): Record<string, string> {
  return Object.fromEntries(result.errors.map((error) => [error.field, error.message]))
}

function readNestedValue(record: Record<string, unknown>, section: string, field: string): unknown {
  const nested = record[section]
  return nested && typeof nested === 'object'
    ? (nested as Record<string, unknown>)[field]
    : undefined
}

function retainSubmittedShape(
  parsed: Record<string, unknown>,
  submitted: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(submitted)
      .filter((key) => key in parsed)
      .map((key) => {
        const parsedValue = parsed[key]
        const submittedValue = submitted[key]
        if (isPlainObject(parsedValue) && isPlainObject(submittedValue)) {
          return [key, retainSubmittedShape(parsedValue, submittedValue)]
        }
        return [key, parsedValue]
      })
  )
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
