// Property 7: Asset Folder Creation Round-Trip

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { AssetOperations } from '@/lib/content/assets'
import type { FileSystemAdapter } from '@/lib/fs/adapter'

/**
 * Validates: Requirements 8.2
 *
 * Property: For any valid folder name, creating a folder and then listing the
 * parent directory SHALL include the newly created folder name in the directories list.
 */

// --- In-memory FileSystemAdapter ---

class InMemoryFS implements FileSystemAdapter {
  private files = new Map<string, string>()
  private directories = new Set<string>()

  constructor() {
    // Root always exists
    this.directories.add('/')
  }

  async readFile(filePath: string): Promise<string> {
    const content = this.files.get(this.normalizePath(filePath))
    if (content === undefined) throw new Error(`File not found: ${filePath}`)
    return content
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    this.files.set(this.normalizePath(filePath), content)
  }

  async deleteFile(filePath: string): Promise<void> {
    this.files.delete(this.normalizePath(filePath))
  }

  async exists(filePath: string): Promise<boolean> {
    const normalized = this.normalizePath(filePath)
    return this.files.has(normalized) || this.directories.has(normalized)
  }

  async listFiles(directory: string, _pattern?: string): Promise<string[]> {
    const normalizedDir = this.normalizePath(directory)
    const results: string[] = []
    for (const key of this.files.keys()) {
      if (key.startsWith(normalizedDir + '/')) {
        const relative = key.slice(normalizedDir.length + 1)
        // Only direct children (no nested path separators)
        if (!relative.includes('/')) {
          results.push(relative)
        }
      }
    }
    return results.sort()
  }

  async listDirectories(directory: string): Promise<string[]> {
    const normalizedDir = this.normalizePath(directory)
    const results = new Set<string>()
    for (const dir of this.directories) {
      if (dir.startsWith(normalizedDir + '/')) {
        const relative = dir.slice(normalizedDir.length + 1)
        // Only direct child directories
        const firstSegment = relative.split('/')[0]
        if (firstSegment && !relative.includes('/')) {
          results.add(firstSegment)
        }
      }
    }
    return [...results].sort()
  }

  async mkdir(dirPath: string): Promise<void> {
    const normalized = this.normalizePath(dirPath)
    // Create all parent directories recursively
    const parts = normalized.split('/').filter(Boolean)
    let current = ''
    for (const part of parts) {
      current += '/' + part
      this.directories.add(current)
    }
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

  private normalizePath(p: string): string {
    // Remove trailing slashes, normalize double slashes
    return p.replace(/\/+/g, '/').replace(/\/$/, '') || '/'
  }
}

// --- Generators ---

/**
 * Arbitrary valid folder name.
 * Folder names should be non-empty, contain only filesystem-safe characters,
 * and not be '.' or '..'.
 */
const folderNameArb = fc
  .stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9_\-. ]{0,30}$/)
  .filter((name) => {
    // Exclude reserved names and names that are just dots/spaces
    const trimmed = name.trim()
    return (
      trimmed.length > 0 &&
      trimmed !== '.' &&
      trimmed !== '..' &&
      !trimmed.startsWith('.') &&
      !trimmed.endsWith('.')
    )
  })

// --- Property Tests ---

describe('Property 7: Asset Folder Creation Round-Trip', () => {
  it('creating a folder and listing parent includes the new folder', async () => {
    await fc.assert(
      fc.asyncProperty(folderNameArb, async (folderName) => {
        const fs = new InMemoryFS()
        const assetsPath = '/assets'
        await fs.mkdir(assetsPath)
        const ops = new AssetOperations(assetsPath, fs)

        // Create the folder at root level
        await ops.createDirectory(folderName)

        // List directories at the root (parent)
        const dirs = await ops.listDirectories()

        // Assert the listing includes the new folder
        expect(dirs).toContain(folderName)
      }),
      { numRuns: 100 },
    )
  })

  it('creating a nested folder and listing its parent includes the new folder', async () => {
    await fc.assert(
      fc.asyncProperty(
        folderNameArb,
        folderNameArb,
        async (parentName, childName) => {
          // Skip when parent and child have the same name to avoid ambiguity
          fc.pre(parentName !== childName)

          const fs = new InMemoryFS()
          const assetsPath = '/assets'
          await fs.mkdir(assetsPath)
          const ops = new AssetOperations(assetsPath, fs)

          // Create the parent folder
          await ops.createDirectory(parentName)

          // Create the child folder inside the parent
          const nestedPath = `${parentName}/${childName}`
          await ops.createDirectory(nestedPath)

          // List directories of the parent
          const dirs = await ops.listDirectories(parentName)

          // Assert the child folder appears in the parent listing
          expect(dirs).toContain(childName)
        },
      ),
      { numRuns: 100 },
    )
  })
})
