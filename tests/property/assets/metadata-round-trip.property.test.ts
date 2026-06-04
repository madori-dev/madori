// Property 8: Asset Metadata Round-Trip

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'fs/promises'
import * as path from 'path'
import { AssetOperations } from '@/lib/content/assets'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'

/**
 * Validates: Requirements 8.3, 8.4
 *
 * Property: For any existing asset and any valid metadata update (alt text or filename),
 * updating the metadata and then fetching the asset SHALL return the updated values.
 */

// --- Generators ---

/**
 * Arbitrary alt text — non-empty strings without problematic YAML characters.
 * Avoids characters that could break YAML parsing in sidecar files.
 */
const altTextArb = fc.string({ minLength: 1, maxLength: 80 })
  .map(s => s.replace(/[\n\r\t]/g, ' ').trim())
  .filter(s => s.length > 0)

/**
 * Arbitrary valid filename — alphanumeric with a file extension.
 * Must be a valid filesystem filename without path separators.
 */
const filenameArb = fc.tuple(
  fc.stringMatching(/^[a-z][a-z0-9_-]{0,20}$/),
  fc.constantFrom('png', 'jpg', 'pdf', 'txt', 'webp', 'svg'),
).map(([name, ext]) => `${name}.${ext}`)

/**
 * Arbitrary metadata update — at least one of alt or filename must be provided.
 */
const metadataUpdateArb = fc.oneof(
  // Alt text only
  altTextArb.map(alt => ({ alt, filename: undefined })),
  // Filename only
  filenameArb.map(filename => ({ alt: undefined, filename })),
  // Both alt and filename
  fc.tuple(altTextArb, filenameArb).map(([alt, filename]) => ({ alt, filename })),
)

// --- Property Tests ---

describe('Property 8: Asset Metadata Round-Trip', () => {
  let assetOps: AssetOperations
  let adapter: NodeFileSystemAdapter
  let tmpDir: string

  beforeEach(async () => {
    adapter = new NodeFileSystemAdapter()
    tmpDir = path.join(process.cwd(), 'tests', '.tmp', `assets-prop8-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await fs.mkdir(tmpDir, { recursive: true })
    assetOps = new AssetOperations(tmpDir, adapter)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('updating alt text then fetching metadata returns the updated alt', async () => {
    await fc.assert(
      fc.asyncProperty(altTextArb, async (alt) => {
        // Create a seed asset file
        const assetName = 'test-asset.png'
        await fs.writeFile(path.join(tmpDir, assetName), 'fake-content')

        // Update metadata with alt text
        await assetOps.updateMetadata(assetName, { alt })

        // Fetch metadata and verify
        const metadata = await assetOps.getMetadata(assetName)
        expect(metadata.alt).toBe(alt)

        // Clean up for next iteration
        await fs.rm(path.join(tmpDir, assetName), { force: true })
        await fs.rm(path.join(tmpDir, `${assetName}.meta.yaml`), { force: true })
      }),
      { numRuns: 100 },
    )
  })

  it('updating filename then fetching metadata returns the updated filename', async () => {
    await fc.assert(
      fc.asyncProperty(filenameArb, async (newFilename) => {
        // Create a seed asset file
        const originalName = 'original-asset.png'
        await fs.writeFile(path.join(tmpDir, originalName), 'fake-content')

        // Update metadata with new filename (triggers rename)
        const updatedAsset = await assetOps.updateMetadata(originalName, { filename: newFilename })

        // The asset should now be at the new path
        expect(updatedAsset.filename).toBe(newFilename)

        // Fetch metadata from the new location
        const metadata = await assetOps.getMetadata(updatedAsset.path)
        expect(metadata.filename).toBe(newFilename)

        // Clean up for next iteration
        await fs.rm(path.join(tmpDir, updatedAsset.path), { force: true })
        await fs.rm(path.join(tmpDir, `${updatedAsset.path}.meta.yaml`), { force: true })
      }),
      { numRuns: 100 },
    )
  })

  it('updating both alt and filename then fetching returns both updated values', async () => {
    await fc.assert(
      fc.asyncProperty(
        metadataUpdateArb.filter(u => u.alt !== undefined && u.filename !== undefined),
        async (update) => {
          // Create a seed asset file
          const originalName = 'seed-file.txt'
          await fs.writeFile(path.join(tmpDir, originalName), 'content')

          // Update metadata with both fields
          const updatedAsset = await assetOps.updateMetadata(originalName, {
            alt: update.alt,
            filename: update.filename,
          })

          // The asset should have the new filename
          expect(updatedAsset.filename).toBe(update.filename!)

          // Alt text should be on the returned asset
          expect(updatedAsset.alt).toBe(update.alt)

          // Fetch metadata from the new location and verify both values persisted
          const metadata = await assetOps.getMetadata(updatedAsset.path)
          expect(metadata.alt).toBe(update.alt)
          expect(metadata.filename).toBe(update.filename)

          // Clean up for next iteration
          await fs.rm(path.join(tmpDir, updatedAsset.path), { force: true })
          await fs.rm(path.join(tmpDir, `${updatedAsset.path}.meta.yaml`), { force: true })
        },
      ),
      { numRuns: 100 },
    )
  })
})
