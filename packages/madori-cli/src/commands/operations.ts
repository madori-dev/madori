import type { Command } from 'commander'
import * as path from 'node:path'
import { loadConfig, resolveConfigPaths } from '../../../../src/lib/config/loader.js'
import {
  createOperationalBackup,
  restoreOperationalBackup,
  verifyOperationalBackup,
  type BackupRoot,
} from '../operations/backup.js'

async function operationalRoots(): Promise<BackupRoot[]> {
  const projectRoot = process.cwd()
  const config = resolveConfigPaths(await loadConfig(projectRoot), projectRoot)
  const configuredUsersPath = config.auth.providerConfig?.usersPath
  const configuredSessionsDir = config.auth.storeConfig?.sessionsDir
  const usersPath = typeof configuredUsersPath === 'string'
    ? path.resolve(projectRoot, configuredUsersPath)
    : config.usersPath
  const sessionsPath = typeof configuredSessionsDir === 'string'
    ? path.resolve(projectRoot, configuredSessionsDir)
    : path.resolve(config.contentPath, '..', '.sessions')
  return [
    { name: 'config', path: path.join(projectRoot, 'madori.config.ts') },
    { name: 'content', path: config.contentPath },
    { name: 'resources', path: config.resourcesPath },
    { name: 'users', path: usersPath },
    { name: 'assets', path: config.assetsPath },
    { name: 'seo-storage', path: config.seo.operationalStoragePath },
    { name: 'sessions', path: sessionsPath },
    { name: 'schema-manifest', path: path.join(projectRoot, '.madori', 'manifest.json') },
  ]
}

export function registerOperations(program: Command): void {
  program.command('backup <path>')
    .description('Create a checksummed operational backup of configured Madori data')
    .action(async (outputPath: string) => {
      const result = await createOperationalBackup({ outputPath, roots: await operationalRoots() })
      console.log(`Backup created: ${result.archivePath}`)
      console.log(`Files: ${result.totalFiles}; bytes: ${result.totalBytes}`)
    })

  program.command('backup:verify <archive-path>')
    .description('Verify backup structure and SHA-256 checksums')
    .action(async (archivePath: string) => {
      const manifest = await verifyOperationalBackup(archivePath)
      console.log(`Backup verified: ${manifest.roots.reduce((total, root) => total + root.files.length, 0)} files`)
    })

  program.command('restore <archive-path>')
    .description('Restore configured Madori data after verification, retaining rollback copies')
    .requiredOption('--yes', 'Confirm destructive replacement of configured data')
    .option('--rollback-dir <path>', 'Directory for pre-restore rollback copies')
    .action(async (archivePath: string, options: { yes: boolean; rollbackDir?: string }) => {
      if (!options.yes) throw new Error('Restore requires --yes confirmation.')
      const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
      const rollbackDirectory = options.rollbackDir
        ?? path.join(process.cwd(), '.madori', 'restore-rollbacks', timestamp)
      const result = await restoreOperationalBackup({
        archivePath,
        roots: await operationalRoots(),
        rollbackDirectory,
      })
      console.log(`Restore completed: ${result.restoredRoots.length} roots`)
      console.log(`Rollback copies: ${result.rollbackDirectory}`)
    })
}
