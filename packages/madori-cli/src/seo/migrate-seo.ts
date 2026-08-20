import { createHash, randomUUID } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import matter from 'gray-matter'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { Command } from 'commander'
import {
  assertMigrationPath,
  migrateSeo,
  type MigrationInput,
  type MigrationRun,
} from '@/lib/seo/migration/runner'
import type { LegacySeoDocument } from '@/lib/seo/migration/legacy'

export interface SeoMigrationCliOptions {
  root: string
  dryRun?: boolean
  extensions?: string[]
}

export interface SeoMigrationCliRun extends MigrationRun {
  root: string
  rollbackPlan: Array<{ path: string; backup?: string; beforeHash?: string; migratedContentHash?: string }>
}

export interface SeoRollbackPlan {
  root: string
  rollbackPlan: SeoMigrationCliRun['rollbackPlan']
}

export interface SeoRollbackResult {
  restored: string[]
  skipped: string[]
  errors: Array<{ path: string; message: string }>
}

function formatFor(filePath: string): 'markdown' | 'yaml' | 'json' {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.md' || extension === '.markdown') return 'markdown'
  if (extension === '.json') return 'json'
  return 'yaml'
}

async function walk(root: string, directory: string, extensions: Set<string>, files: string[]): Promise<void> {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const candidate = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await walk(root, candidate, extensions, files)
    } else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(assertMigrationPath(root, candidate))
    }
  }
}

function parseDocument(filePath: string, raw: string): { data: LegacySeoDocument; body: string } {
  const format = formatFor(filePath)
  if (format === 'markdown') {
    const parsed = matter(raw)
    return { data: parsed.data as LegacySeoDocument, body: parsed.content }
  }
  return { data: ((format === 'json' ? JSON.parse(raw) : parseYaml(raw)) ?? {}) as LegacySeoDocument, body: '' }
}

function serializeDocument(filePath: string, data: LegacySeoDocument, body: string): string {
  const format = formatFor(filePath)
  if (format === 'markdown') return matter.stringify(body, data)
  if (format === 'json') return `${JSON.stringify(data, null, 2)}\n`
  return stringifyYaml(data, { lineWidth: 0 })
}

function contentHash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function uniqueBackupPath(filePath: string): Promise<string> {
  const base = `${filePath}.seo-migration.bak`
  let candidate = base
  let suffix = 1
  while (true) {
    try {
      await fs.access(candidate)
      candidate = `${base}.${suffix++}`
    } catch {
      return candidate
    }
  }
}

export async function migrateSeoFiles(options: SeoMigrationCliOptions): Promise<SeoMigrationCliRun> {
  const root = path.resolve(options.root)
  const extensions = new Set((options.extensions ?? ['.md', '.markdown', '.yaml', '.yml', '.json']).map((item) => item.toLowerCase()))
  const files: string[] = []
  await walk(root, root, extensions, files)
  const inputs: MigrationInput[] = files.map((filePath) => {
    let original = ''
    let body = ''
    let parsed: LegacySeoDocument
    return {
      path: filePath,
      adapter: {
        read: async () => {
          original = await fs.readFile(filePath, 'utf8')
          const result = parseDocument(filePath, original)
          parsed = result.data
          body = result.body
          return parsed
        },
        backup: async () => {
          const backupPath = await uniqueBackupPath(filePath)
          await fs.writeFile(backupPath, original, 'utf8')
          return backupPath
        },
        write: async (document: LegacySeoDocument) => {
          const serialized = serializeDocument(filePath, document, body)
          const latest = await fs.readFile(filePath, 'utf8')
          if (contentHash(latest) !== contentHash(original)) {
            throw new Error(`SEO migration source changed before write: ${filePath}`)
          }
          const temporary = `${filePath}.seo-migration.${process.pid}.${randomUUID()}.tmp`
          await fs.writeFile(temporary, serialized, 'utf8')
          await fs.rename(temporary, filePath)
          // Readback guards against adapters that accidentally serialize stale data.
          if (contentHash(await fs.readFile(filePath, 'utf8')) !== contentHash(serialized)) {
            throw new Error(`SEO migration write verification failed: ${filePath}`)
          }
        },
      },
    }
  })
  const result = await migrateSeo(inputs, { dryRun: options.dryRun })
  const migratedContentHashes = new Map<string, string>()
  if (!options.dryRun) {
    for (const operation of result.operations.filter(operation => operation.changed)) {
      migratedContentHashes.set(operation.path, contentHash(await fs.readFile(operation.path, 'utf8')))
    }
  }
  return {
    ...result,
    root,
    rollbackPlan: result.operations
      .filter((operation) => operation.changed)
      .map((operation) => ({ path: operation.path, backup: operation.backup, beforeHash: operation.beforeHash, migratedContentHash: migratedContentHashes.get(operation.path) })),
  }
}

/** Restore backups from a completed run. Missing backups are reported, never silently ignored. */
export async function rollbackSeoMigration(run: SeoRollbackPlan): Promise<SeoRollbackResult> {
  const result: SeoRollbackResult = { restored: [], skipped: [], errors: [] }
  for (const operation of run.rollbackPlan) {
    if (!operation.backup) {
      result.skipped.push(operation.path)
      continue
    }
    try {
      const target = assertMigrationPath(run.root, operation.path)
      const backup = path.resolve(operation.backup)
      const backupBase = `${target}.seo-migration.bak`
      if (backup !== backupBase && !new RegExp(`^${backupBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.\\d+$`).test(backup)) {
        throw new Error('Rollback backup path is not valid for this migration target.')
      }
      if (!operation.migratedContentHash || !/^[a-f0-9]{64}$/.test(operation.migratedContentHash)) {
        throw new Error('Rollback is unavailable because this migration did not record its written-content hash.')
      }
      const current = await fs.readFile(target, 'utf8')
      if (contentHash(current) !== operation.migratedContentHash) {
        throw new Error('SEO migration target changed after migration; refusing to overwrite it during rollback.')
      }
      const original = await fs.readFile(backup, 'utf8')
      const temporary = `${target}.seo-rollback.${process.pid}.${randomUUID()}.tmp`
      await fs.writeFile(temporary, original, 'utf8')
      await fs.rename(temporary, target)
      result.restored.push(target)
    } catch (error) {
      result.errors.push({ path: operation.path, message: error instanceof Error ? error.message : String(error) })
    }
  }
  return result
}

async function writeRollbackPlan(filePath: string, run: SeoMigrationCliRun): Promise<void> {
  const absolute = path.resolve(filePath)
  await fs.mkdir(path.dirname(absolute), { recursive: true })
  await fs.writeFile(absolute, `${JSON.stringify({ root: run.root, rollbackPlan: run.rollbackPlan }, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  })
}

async function readRollbackPlan(filePath: string): Promise<SeoRollbackPlan> {
  const parsed: unknown = JSON.parse(await fs.readFile(path.resolve(filePath), 'utf8'))
  if (!parsed || typeof parsed !== 'object' || !('root' in parsed) || !('rollbackPlan' in parsed)
    || typeof parsed.root !== 'string' || !Array.isArray(parsed.rollbackPlan)) {
    throw new Error('SEO rollback plan is invalid.')
  }
  return parsed as SeoRollbackPlan
}

export function registerMigrateSeo(program: Command): void {
  program
    .command('seo:migrate')
    .description('Migrate legacy SEO frontmatter fields into nested seo values')
    .option('--root <path>', 'Content/resource root to scan', './content')
    .option('--dry-run', 'Report changes without writing files')
    .option('--plan <path>', 'Write a private rollback plan after applying changes')
    .action(async (options: { root: string; dryRun?: boolean; plan?: string }) => {
      const result = await migrateSeoFiles(options)
      if (options.plan) {
        if (result.dryRun) throw new Error('A rollback plan can only be written for an applied migration.')
        await writeRollbackPlan(options.plan, result)
      }
      console.log(JSON.stringify({
        root: result.root,
        dryRun: result.dryRun,
        filesScanned: result.filesScanned,
        filesChanged: result.filesChanged,
        fieldsMigrated: result.fieldsMigrated,
        fieldsPreserved: result.fieldsPreserved,
        rollbackPlan: result.rollbackPlan,
        warnings: result.operations.flatMap((operation) => operation.warnings.map((message) => ({ path: operation.path, message }))),
        plan: options.plan ? path.resolve(options.plan) : null,
      }, null, 2))
    })

  program
    .command('seo:rollback')
    .description('Safely restore files from an SEO migration rollback plan')
    .requiredOption('--plan <path>', 'Rollback plan written by seo:migrate')
    .action(async (options: { plan: string }) => {
      const result = await rollbackSeoMigration(await readRollbackPlan(options.plan))
      console.log(JSON.stringify(result, null, 2))
      if (result.errors.length) process.exitCode = 1
    })
}
