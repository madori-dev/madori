import type { Command } from 'commander'
import * as path from 'path'
import { NodeFileSystemAdapter } from '../../../../src/lib/fs/adapter.js'
import { VersionTracker } from '../../../../src/lib/versioning/tracker.js'

/** The schema version expected by the current codebase. */
const EXPECTED_SCHEMA_VERSION = '1.0.0'

/** Default manifest path relative to project root. */
const DEFAULT_MANIFEST_PATH = '.madori/manifest.json'

export function registerCheck(program: Command): void {
  program
    .command('check')
    .description('Check whether the manifest schema version matches the running codebase')
    .option('--manifest <path>', 'Path to manifest file', DEFAULT_MANIFEST_PATH)
    .action(async (options: { manifest: string }) => {
      const manifestPath = path.resolve(process.cwd(), options.manifest)
      const fs = new NodeFileSystemAdapter()
      const tracker = new VersionTracker(fs, manifestPath, EXPECTED_SCHEMA_VERSION)

      const result = await tracker.check()

      if (result.compatible) {
        console.log(
          `✓ Schema version is up to date (v${result.currentVersion})`
        )
        process.exitCode = 0
      } else {
        console.error(
          `✗ Schema version mismatch: manifest is v${result.currentVersion}, expected v${result.expectedVersion}`
        )
        if (result.pendingVersions.length > 0) {
          console.error('Pending versions:')
          for (const version of result.pendingVersions) {
            console.error(`  - v${version}`)
          }
        }
        process.exitCode = 1
      }
    })
}
