import { z } from 'zod'
import * as path from 'path'
import type { FileSystemAdapter } from '@/lib/fs/adapter'

export const ManifestSchema = z.object({
  schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  changelog: z.array(z.string().regex(/^\d+\.\d+\.\d+$/)),
})

export interface Manifest {
  schemaVersion: string
  changelog: string[]
}

export interface VersionCheckResult {
  compatible: boolean
  currentVersion: string
  expectedVersion: string
  pendingVersions: string[]
}

export class VersionTracker {
  constructor(
    private readonly fs: FileSystemAdapter,
    private readonly manifestPath: string,
    private readonly expectedVersion: string
  ) {}

  /** Read or initialise the manifest file. */
  async loadManifest(): Promise<Manifest> {
    const exists = await this.fs.exists(this.manifestPath)

    if (!exists) {
      const manifest: Manifest = {
        schemaVersion: this.expectedVersion,
        changelog: [],
      }
      await this.writeManifest(manifest)
      return manifest
    }

    const content = await this.fs.readFile(this.manifestPath)
    const parsed = JSON.parse(content)
    const result = ManifestSchema.parse(parsed)

    return result
  }

  /** Compare manifest version against expected. */
  async check(): Promise<VersionCheckResult> {
    const manifest = await this.loadManifest()
    const compatible = manifest.schemaVersion === this.expectedVersion

    const pendingVersions: string[] = []
    if (!compatible) {
      // Collect versions between current manifest version and expected
      // The changelog contains previous versions in reverse chronological order
      // If the manifest is behind, pending versions are those the manifest hasn't reached yet
      const allVersions = [manifest.schemaVersion, ...manifest.changelog]
      // If expectedVersion is not in the history, it's ahead of the manifest
      if (!allVersions.includes(this.expectedVersion)) {
        // We can't enumerate intermediate versions without a registry,
        // but we can report the expected version as pending
        pendingVersions.push(this.expectedVersion)
      }
    }

    return {
      compatible,
      currentVersion: manifest.schemaVersion,
      expectedVersion: this.expectedVersion,
      pendingVersions,
    }
  }

  /** Bump version: set new schemaVersion, append old to changelog. */
  async bumpVersion(newVersion: string): Promise<Manifest> {
    const manifest = await this.loadManifest()
    const previousVersion = manifest.schemaVersion

    const updatedManifest: Manifest = {
      schemaVersion: newVersion,
      changelog: [previousVersion, ...manifest.changelog],
    }

    await this.writeManifest(updatedManifest)
    return updatedManifest
  }

  private async writeManifest(manifest: Manifest): Promise<void> {
    const dir = path.dirname(this.manifestPath)
    const dirExists = await this.fs.exists(dir)
    if (!dirExists) {
      await this.fs.mkdir(dir)
    }
    const content = JSON.stringify(manifest, null, 2)
    await this.fs.writeFile(this.manifestPath, content)
  }
}
