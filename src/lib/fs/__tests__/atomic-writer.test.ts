// Property 8: Atomic write integrity

import { describe, it, expect, afterEach } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { AtomicFileWriter } from '@/lib/fs/atomic-writer'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'

/**
 * Validates: Requirements 4.1
 *
 * Property: For any string content and target file path, a successful
 * writeFileAtomic() call SHALL result in the target file containing exactly
 * that content with no residual temporary files in the directory.
 */

// --- Setup ---

const tmpDirs: string[] = []

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-atomic-test-'))
  tmpDirs.push(dir)
  return dir
}

afterEach(async () => {
  for (const dir of tmpDirs) {
    try {
      await fs.rm(dir, { recursive: true, force: true })
    } catch {
      // Best-effort cleanup
    }
  }
  tmpDirs.length = 0
})

// --- Generators ---

/** Arbitrary file content — any unicode string including empty */
const contentArb = fc.string({ minLength: 0, maxLength: 2000 })

/** Arbitrary safe file name (no path traversal, valid for filesystem) */
const fileNameArb = fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,30}$/)

// --- Property Tests ---

describe('Property 8: Atomic write integrity', () => {
  it('target file contains exact content after successful write with no residual temp files', async () => {
    const adapter = new NodeFileSystemAdapter()
    const writer = new AtomicFileWriter(adapter)

    await fc.assert(
      fc.asyncProperty(contentArb, fileNameArb, async (content, fileName) => {
        const dir = await createTempDir()
        const targetPath = path.join(dir, fileName)

        const result = await writer.writeFileAtomic(targetPath, content)

        // Write should succeed
        expect(result.success).toBe(true)

        // Target file should exist with exact content
        const written = await fs.readFile(targetPath, 'utf-8')
        expect(written).toBe(content)

        // No residual .tmp.* files should remain in the directory
        const files = await fs.readdir(dir)
        const tempFiles = files.filter((f) => f.includes('.tmp.'))
        expect(tempFiles).toHaveLength(0)
      }),
      { numRuns: 100 },
    )
  })
})
