import * as path from 'node:path'
import { createHash } from 'node:crypto'
import {
  translateLegacySeo,
  type LegacyMigrationChange,
  type LegacySeoDocument,
} from './legacy.js'

export interface MigrationAdapter {
  read(): Promise<LegacySeoDocument> | LegacySeoDocument
  /** Write complete serialized content. Adapter must make replacement atomic. */
  write(document: LegacySeoDocument): Promise<void> | void
  /** Optional backup callback, invoked once immediately before write. */
  backup?(document: LegacySeoDocument): Promise<string> | string
}
export interface MigrationOperation {
  path: string
  changed: boolean
  migrated: LegacyMigrationChange[]
  preserved: LegacyMigrationChange[]
  warnings: string[]
  backup?: string
  beforeHash?: string
  afterHash?: string
}

export interface MigrationRun {
  dryRun: boolean
  filesScanned: number
  filesChanged: number
  fieldsMigrated: number
  fieldsPreserved: number
  operations: MigrationOperation[]
}

export interface MigrationInput {
  path: string
  adapter: MigrationAdapter
}

export function assertMigrationPath(root: string, candidate: string): string {
  const absoluteRoot = path.resolve(root)
  const absoluteCandidate = path.resolve(candidate)
  const relative = path.relative(absoluteRoot, absoluteCandidate)
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Migration path escapes configured root: ${candidate}`)
  }
  return absoluteCandidate
}

function hash(document: LegacySeoDocument): string {
  return createHash('sha256').update(JSON.stringify(document)).digest('hex')
}

/**
 * Execute migration through caller-owned adapters. Dry runs never call backup
 * or write. Adapters own serialization and atomic replacement details.
 */
export async function migrateSeo(
  inputs: Iterable<MigrationInput>,
  options: { dryRun?: boolean } = {}
): Promise<MigrationRun> {
  const dryRun = options.dryRun ?? false
  const run: MigrationRun = {
    dryRun,
    filesScanned: 0,
    filesChanged: 0,
    fieldsMigrated: 0,
    fieldsPreserved: 0,
    operations: [],
  }

  for (const input of inputs) {
    const before = await input.adapter.read()
    const result = translateLegacySeo(before)
    run.filesScanned++
    run.fieldsMigrated += result.migrated.length
    run.fieldsPreserved += result.preserved.length
    if (result.changed) run.filesChanged++

    const operation: MigrationOperation = {
      path: input.path,
      changed: result.changed,
      migrated: result.migrated,
      preserved: result.preserved,
      warnings: result.warnings,
      beforeHash: hash(before),
      afterHash: hash(result.document),
    }
    if (result.changed && !dryRun) {
      operation.backup = await input.adapter.backup?.(before)
      await input.adapter.write(result.document)
    }
    run.operations.push(operation)
  }
  return run
}
