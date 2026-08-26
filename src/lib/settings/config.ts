import fs from 'node:fs/promises'
import path from 'node:path'
import { MadoriConfigSchema, type MadoriConfig, type MadoriConfigInput } from '@/lib/config/schema'
import { AtomicFileWriter } from '@/lib/fs/atomic-writer'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import {
  parseSettingsConfigEdit,
  projectSettingsConfig,
  validateSettingsPaths,
  type SettingsConfig,
} from '@/lib/settings/model'

export interface ValidationResult {
  valid: boolean
  errors: { field: string; message: string }[]
}

let configImportRevision = 0

/**
 * Service for reading, writing, and validating the madori.config.ts file.
 *
 * Read uses dynamic import (bypassing module cache).
 * Write uses AST-aware serialisation that preserves the file's
 * import statement and `export default` wrapper.
 */
export class MadoriConfigService {
  constructor(private configPath: string) {}

  /**
   * Reads and validates the current config from madori.config.ts.
   */
  async read(): Promise<MadoriConfig> {
    const absolutePath = path.resolve(this.configPath)
    const cacheBuster = `?revision=${++configImportRevision}`
    const importedConfig = await import(/* webpackIgnore: true */ `${absolutePath}${cacheBuster}`)
    const rawConfig = importedConfig.default ?? importedConfig
    return MadoriConfigSchema.parse(rawConfig)
  }

  /** Browser-safe view. Auth adapter options can contain credentials. */
  async readPublic(): Promise<SettingsConfig> {
    return projectSettingsConfig(await this.read())
  }

  /**
   * Writes a partial config update to madori.config.ts, preserving the
   * import statement and export default structure.
   */
  async write(config: unknown): Promise<void> {
    const absolutePath = path.resolve(this.configPath)

    // Read the current file content
    const content = await fs.readFile(absolutePath, 'utf-8')

    // Read the existing config to merge with updates
    const existing = await this.read()
    const edit = parseSettingsConfigEdit(config)
    const merged = deepMerge(existing, edit)

    // Validate merged configuration, not only submitted fields. This keeps
    // partial writes from producing a config that cannot be loaded at runtime.
    const validation = validateConfig(merged)
    if (!validation.valid) {
      throw new Error(
        `Config validation failed: ${validation.errors.map((e) => `${e.field}: ${e.message}`).join(', ')}`
      )
    }

    // Re-serialise the config preserving file structure
    const updated = rewriteConfigFile(content, merged as MadoriConfig)
    const result = await new AtomicFileWriter(new NodeFileSystemAdapter()).writeFileAtomic(absolutePath, updated)
    if (!result.success) throw result.error ?? new Error(`Could not write config: ${absolutePath}`)
  }

  /**
   * Validates a partial config update. Rejects empty or whitespace-only
   * path values for contentPath, resourcesPath, usersPath, assetsPath.
   */
  async validate(config: Partial<MadoriConfigInput>): Promise<ValidationResult> {
    return validateSettingsPaths(config)
  }

  /** Validate update against complete config which will be persisted. */
  async validateForWrite(config: unknown): Promise<ValidationResult> {
    let edit
    try {
      edit = parseSettingsConfigEdit(config)
    } catch (error) {
      const issues = error && typeof error === 'object' && 'issues' in error
        ? (error as { issues: { path: PropertyKey[]; message: string }[] }).issues
        : [{ path: [] as PropertyKey[], message: 'Invalid settings configuration' }]
      return {
        valid: false,
        errors: issues.map((issue) => ({
          field: issue.path.map(String).join('.') || 'config',
          message: issue.message,
        })),
      }
    }
    return validateConfig(deepMerge(await this.read(), edit))
  }
}

function validateConfig(config: Record<string, unknown>): ValidationResult {
  const errors = [...validateSettingsPaths(config).errors]

  // App Router route files are statically located. Accepting an arbitrary
  // configured path here would persist a value that cannot receive requests.
  const cp = config.cp
  if (cp && typeof cp === 'object' && (cp as Record<string, unknown>).path !== '/cp') {
    errors.push({ field: 'cp.path', message: 'Control Panel path is fixed at /cp in this build' })
  }
  const graphql = config.graphql
  if (graphql && typeof graphql === 'object' && (graphql as Record<string, unknown>).path !== '/api/graphql') {
    errors.push({ field: 'graphql.path', message: 'GraphQL path is fixed at /api/graphql in this build' })
  }

  const parsed = MadoriConfigSchema.safeParse(config)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push({ field: issue.path.join('.') || 'config', message: issue.message })
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Rewrites the config file content, preserving the import statement line(s)
 * and the `export default` wrapper while replacing the config object body.
 */
function rewriteConfigFile(originalContent: string, config: MadoriConfig): string {
  // Extract everything before the config object assignment
  // Pattern: find lines up to and including the opening `{` of the config const
  const importLines: string[] = []
  const lines = originalContent.split('\n')

  let configStartLine = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Look for the config variable declaration with opening brace
    if (/^\s*(?:const|let|var)\s+\w+\s*(?::[^=]+=|=)\s*\{/.test(line)) {
      configStartLine = i
      break
    }
    // Also check for bare `export default {`
    if (/^\s*export\s+default\s+\{/.test(line)) {
      configStartLine = i
      break
    }
  }

  if (configStartLine === -1) {
    // Fallback: rebuild from scratch
    return buildConfigFile(config)
  }

  // Collect import/type lines before the config object
  for (let i = 0; i < configStartLine; i++) {
    importLines.push(lines[i])
  }

  // Determine if the file uses `export default config` at the end or inline export
  const hasExportDefault = originalContent.includes('export default config')
  const hasInlineExport = /export\s+default\s+\{/.test(originalContent)

  // Serialize the config object
  const serialized = serializeConfigObject(config, '  ')

  // Rebuild file
  const parts: string[] = []

  // Preserve import lines
  if (importLines.length > 0) {
    parts.push(importLines.join('\n'))
    parts.push('')
  }

  if (hasInlineExport) {
    parts.push(`export default ${serialized}`)
  } else {
    // Preserve the type annotation pattern from the original
    const configDecl = lines[configStartLine]
    const typeAnnotation = extractTypeAnnotation(configDecl)
    if (typeAnnotation) {
      parts.push(`const config: ${typeAnnotation} = ${serialized}`)
    } else {
      parts.push(`const config = ${serialized}`)
    }

    if (hasExportDefault) {
      parts.push('')
      parts.push('export default config')
    }
  }

  parts.push('')
  return parts.join('\n')
}

/**
 * Extracts the type annotation from a config declaration line.
 * e.g. "const config: MadoriConfigInput & { collections?: ... } = {" → "MadoriConfigInput & { collections?: Record<string, unknown> }"
 */
function extractTypeAnnotation(line: string): string | null {
  const match = line.match(/const\s+\w+\s*:\s*(.+?)\s*=\s*\{?\s*$/)
  if (match) {
    return match[1].trim()
  }
  return null
}

/**
 * Builds a config file from scratch with standard structure.
 */
function buildConfigFile(config: MadoriConfig): string {
  const serialized = serializeConfigObject(config, '  ')
  return [
    "import type { MadoriConfigInput } from './src/lib/config/schema'",
    '',
    `const config: MadoriConfigInput = ${serialized}`,
    '',
    'export default config',
    '',
  ].join('\n')
}

/**
 * Serializes a config object to a TypeScript object literal string.
 */
function serializeConfigObject(obj: Record<string, unknown>, indent: string): string {
  const entries: string[] = []

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue

    const serializedValue = serializeValue(value, indent + '  ')
    const formattedKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
      ? key
      : `'${key}'`
    entries.push(`${indent}${formattedKey}: ${serializedValue},`)
  }

  if (entries.length === 0) {
    return '{}'
  }

  return `{\n${entries.join('\n')}\n}`
}

function serializeValue(value: unknown, indent: string): string {
  if (value === null || value === undefined) {
    return 'undefined'
  }

  if (typeof value === 'string') {
    return `'${escapeString(value)}'`
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const items = value.map((v) => serializeValue(v, indent + '  '))
    if (items.every((i) => !i.includes('\n')) && items.join(', ').length < 60) {
      return `[${items.join(', ')}]`
    }
    return `[\n${items.map((i) => `${indent}  ${i},`).join('\n')}\n${indent}]`
  }

  if (typeof value === 'object') {
    const entries: string[] = []
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val === undefined) continue
      const serializedVal = serializeValue(val, indent + '  ')
      const formattedKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
        ? key
        : `'${key}'`
      entries.push(`${indent}  ${formattedKey}: ${serializedVal},`)
    }
    if (entries.length === 0) return '{}'
    return `{\n${entries.join('\n')}\n${indent}}`
  }

  return String(value)
}

function escapeString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')
}

/**
 * Deep merges source into target. Source values override target values.
 * Nested objects are merged recursively.
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>
): T {
  const result = { ...target } as Record<string, unknown>

  for (const [key, sourceValue] of Object.entries(source)) {
    if (sourceValue === undefined) continue

    const targetValue = result[key]

    if (
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      )
    } else {
      result[key] = sourceValue
    }
  }

  return result as T
}

export { deepMerge, rewriteConfigFile, serializeConfigObject, serializeValue }
