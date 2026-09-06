import fs from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'
import { isDeepStrictEqual } from 'node:util'
import { withFileLocks } from '@/lib/content/concurrency'
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

    return withFileLocks([absolutePath], async () => {
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
      const updated = rewriteConfigFile(content, changedSettings(edit, projectSettingsConfig(existing)))
      const result = await new AtomicFileWriter(new NodeFileSystemAdapter()).writeFileAtomic(absolutePath, updated)
      if (!result.success) throw result.error ?? new Error(`Could not write config: ${absolutePath}`)
    })
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

/** Browser forms may submit every setting; leave unchanged source expressions intact. */
function changedSettings(edit: Record<string, unknown>, current: Record<string, unknown>): Record<string, unknown> {
  const changed: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(edit)) {
    if (value === undefined || isDeepStrictEqual(value, current[key])) continue
    const previous = current[key]
    if (value && typeof value === 'object' && !Array.isArray(value)
      && previous && typeof previous === 'object' && !Array.isArray(previous)) {
      const nested = changedSettings(value as Record<string, unknown>, previous as Record<string, unknown>)
      if (Object.keys(nested).length) changed[key] = nested
    } else {
      changed[key] = value
    }
  }
  return changed
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
function rewriteConfigFile(originalContent: string, edit: Record<string, unknown>): string {
  const source = ts.createSourceFile('madori.config.ts', originalContent, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const exported = source.statements.find(ts.isExportAssignment)
  let expression = exported?.expression
  if (expression && ts.isIdentifier(expression)) {
    const name = expression.text
    expression = source.statements.filter(ts.isVariableStatement)
      .flatMap(statement => [...statement.declarationList.declarations])
      .find(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === name)?.initializer
  }
  const unwrap = (value: ts.Expression): ts.Expression => {
    while (ts.isParenthesizedExpression(value) || ts.isAsExpression(value) || ts.isSatisfiesExpression(value)) value = value.expression
    return value
  }
  const object = expression && unwrap(expression)
  if (!object || !ts.isObjectLiteralExpression(object)) {
    throw new Error('Settings edits require an exported object literal; edit computed configuration in source.')
  }
  const changes: { start: number; end: number; value: string }[] = []
  const visit = (node: ts.ObjectLiteralExpression, patch: Record<string, unknown>) => {
    const additions: string[] = []
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue
      const matches = node.properties.filter(property => property.name
        && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && property.name.text === key)
      const property = matches.at(-1)
      if (property) {
        if (node.properties.some(candidate => ts.isSpreadAssignment(candidate) && candidate.pos > property.pos)) throw new Error(`Settings property "${key}" may be overridden by a spread; edit it in source.`)
        if (!ts.isPropertyAssignment(property)) throw new Error(`Settings property "${key}" must use an explicit value.`)
        const initializer = unwrap(property.initializer)
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          if (!ts.isObjectLiteralExpression(initializer)) throw new Error(`Settings property "${key}" must use an object literal for partial edits.`)
          visit(initializer, value as Record<string, unknown>)
        } else {
          changes.push({ start: property.initializer.getStart(source), end: property.initializer.end, value: serializeValue(value, '  ') })
        }
      } else {
        if (node.properties.some(ts.isSpreadAssignment)) throw new Error(`Settings property "${key}" is inherited from a spread; edit it in source.`)
        additions.push(`${JSON.stringify(key)}: ${serializeValue(value, '  ')}`)
      }
    }
    if (additions.length) {
      const last = node.properties.at(-1)
      // Insert after the final property, before trailing comments and closing brace.
      const position = last?.end ?? node.getStart(source) + 1
      changes.push({ start: position, end: position, value: `${last ? ',' : ''}\n  ${additions.join(',\n  ')}` })
    }
  }
  visit(object, edit)
  return changes.sort((left, right) => right.start - left.start)
    .reduce((text, change) => text.slice(0, change.start) + change.value + text.slice(change.end), originalContent)
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
      : `'${escapeString(key)}'`
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
        : `'${escapeString(key)}'`
      entries.push(`${indent}  ${formattedKey}: ${serializedVal},`)
    }
    if (entries.length === 0) return '{}'
    return `{\n${entries.join('\n')}\n${indent}}`
  }

  return String(value)
}

function escapeString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')
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
