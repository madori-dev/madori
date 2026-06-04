// Property 10: Bulk Asset Move Consistency

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'fs/promises'
import * as path from 'path'
import { AssetOperations } from '@/lib/content/assets'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'

/**
 * Validates: Requirements 8.7
 *
 * Property: For any set of asset paths and any valid destination folder,
 * performing a bulk move SHALL result in all specified assets existing at
 * the destination and none remaining at the original locations.
 */

// --- Generators ---

/**
 * Arbitrary valid filename — alphanumeric with a file extension.
 */
const filenameArb = fc.tuple(
  fc.stringMatching(/^[a-z][a-z0-9_-]{0,12}$/),
  fc.constantFrom('png', 'jpg', 'pdf', 'txt', 'webp', 'svg', 'mp4', 'zip'),
).map(([name, ext]) => `${name}.${ext}`)

/**
 * Arbitrary valid folder name for destination.
 */
const folderNameArb = fc.stringMatching(/^[a-z][a-z0-9_-]{0,15}$/)

/**
 * Generate a unique set of asset filenames (1-5 assets) and a destination folder.
 */
const bulkMoveArgsArb = fc.tuple(
  fc.uniqueArray(filenameArb, { minLength: 1, maxLength: 5 }),
  folderNameArb,
).filter(([files, folder]) => {
  // Ensure no filename matches the folder name (avoid path conflicts)
  return files.every(f => f !== folder)
})

// --- Property Tests ---

describe('Property 10: Bulk Asset Move Consistency', () => {
  let assetOps: AssetOperations
  let adapter: NodeFileSystemAdapter
  let tmpDir: string

  beforeEach(async () => {
    adapter = new NodeFileSystemAdapter()
    tmpDir = path.join(
      process.cwd(),
      'tests',
      '.tmp',
      `assets-prop10-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    await fs.mkdir(tmpDir, { recursive: true })
    assetOps = new AssetOperations(tmpDir, adapter)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('all assets exist at destination after bulk move', async () => {
    await fc.assert(
      fc.asyncProperty(bulkMoveArgsArb, async ([filenames, destFolder]) => {
        // Create seed asset files at root
        for (const filename of filenames) {
          await fs.writeFile(path.join(tmpDir, filename), `content-${filename}`)
        }

        // Create destination folder
        await assetOps.createDirectory(destFolder)

        // Perform bulk move
        await assetOps.bulkMove(filenames, destFolder)

        // Assert all assets exist at destination
        for (const filename of filenames) {
          const destPath = path.join(tmpDir, destFolder, filename)
          const exists = await adapter.exists(destPath)
          expect(exists, `Expected ${filename} to exist at destination ${destFolder}/`).toBe(true)
        }
      }),
      { numRuns: 100 },
    )
  })

  it('no assets remain at original locations after bulk move', async () => {
    await fc.assert(
      fc.asyncProperty(bulkMoveArgsArb, async ([filenames, destFolder]) => {
        // Create seed asset files at root
        for (const filename of filenames) {
          await fs.writeFile(path.join(tmpDir, filename), `content-${filename}`)
        }

        // Create destination folder
        await assetOps.createDirectory(destFolder)

        // Perform bulk move
        await assetOps.bulkMove(filenames, destFolder)

        // Assert none remain at original locations
        for (const filename of filenames) {
          const originalPath = path.join(tmpDir, filename)
          const exists = await adapter.exists(originalPath)
          expect(exists, `Expected ${filename} to NOT exist at original location`).toBe(false)
        }
      }),
      { numRuns: 100 },
    )
  })
})
