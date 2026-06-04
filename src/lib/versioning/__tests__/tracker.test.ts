// Property 11: Version changelog preserves history

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { VersionTracker } from '@/lib/versioning/tracker'
import type { FileSystemAdapter } from '@/lib/fs/adapter'

/**
 * Validates: Requirements 7.7
 *
 * Property: For any sequence of version bumps applied to a manifest, the changelog
 * array SHALL contain all previous versions in reverse chronological order, and the
 * `schemaVersion` SHALL equal the most recently bumped version.
 */

// --- In-memory FileSystemAdapter ---

class InMemoryFS implements FileSystemAdapter {
  private files = new Map<string, string>()
  private dirs = new Set<string>()

  async readFile(filePath: string): Promise<string> {
    const content = this.files.get(filePath)
    if (content === undefined) throw new Error(`File not found: ${filePath}`)
    return content
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    this.files.set(filePath, content)
  }

  async deleteFile(filePath: string): Promise<void> {
    this.files.delete(filePath)
  }

  async exists(filePath: string): Promise<boolean> {
    return this.files.has(filePath) || this.dirs.has(filePath)
  }

  async listFiles(): Promise<string[]> {
    return []
  }

  async listDirectories(): Promise<string[]> {
    return []
  }

  async mkdir(dirPath: string): Promise<void> {
    this.dirs.add(dirPath)
  }

  async copyFile(src: string, dest: string): Promise<void> {
    const content = await this.readFile(src)
    await this.writeFile(dest, content)
  }

  async moveFile(src: string, dest: string): Promise<void> {
    const content = await this.readFile(src)
    await this.writeFile(dest, content)
    await this.deleteFile(src)
  }
}

// --- Generators ---

/** Generate a semver-like version string (MAJOR.MINOR.PATCH) */
const semverArb = fc.tuple(
  fc.integer({ min: 0, max: 99 }),
  fc.integer({ min: 0, max: 99 }),
  fc.integer({ min: 0, max: 99 }),
).map(([major, minor, patch]) => `${major}.${minor}.${patch}`)

/** Generate a non-empty sequence of distinct version strings for bumping */
const versionSequenceArb = fc.array(semverArb, { minLength: 2, maxLength: 20 })
  .filter((versions) => {
    // Ensure all versions are distinct so each bump is meaningful
    return new Set(versions).size === versions.length
  })

// --- Property Tests ---

describe('Property 11: Version changelog preserves history', () => {
  it('changelog contains all previous versions in reverse chronological order after bump sequences', async () => {
    await fc.assert(
      fc.asyncProperty(
        versionSequenceArb,
        async (versions) => {
          // First version is the initial version, rest are bumps
          const [initialVersion, ...bumps] = versions

          const fs = new InMemoryFS()
          const manifestPath = '/.madori/manifest.json'
          const tracker = new VersionTracker(fs, manifestPath, initialVersion)

          // Load manifest — initialises with the initial version
          await tracker.loadManifest()

          // Apply each bump in sequence
          let finalManifest = await tracker.loadManifest()
          for (const newVersion of bumps) {
            finalManifest = await tracker.bumpVersion(newVersion)
          }

          // Verify: schemaVersion equals the last bumped version
          const lastBumpedVersion = bumps[bumps.length - 1]
          expect(finalManifest.schemaVersion).toBe(lastBumpedVersion)

          // Verify: changelog contains all previous versions in reverse chronological order
          // The history should be: [second-to-last bump, ..., first bump, initial version]
          // i.e. [initialVersion, bumps[0], bumps[1], ..., bumps[n-2]] reversed
          const allPreviousVersions = [initialVersion, ...bumps.slice(0, -1)]
          const expectedChangelog = [...allPreviousVersions].reverse()

          expect(finalManifest.changelog).toEqual(expectedChangelog)

          // Verify: changelog length equals the number of bumps
          expect(finalManifest.changelog).toHaveLength(bumps.length)
        },
      ),
      { numRuns: 100 },
    )
  })
})
