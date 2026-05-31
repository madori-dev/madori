// Property 4: Session destroy invalidates token

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { FileSessionStore } from '@/lib/auth/stores/file'
import type { FileSystemAdapter } from '@/lib/fs/adapter'

/**
 * Validates: Requirements 2.6
 *
 * Property: For any created session, calling destroySession with that session's
 * token and then calling validateSession with the same token SHALL return null.
 */

// --- In-memory FileSystemAdapter mock ---

function createInMemoryFs(): FileSystemAdapter {
  const files = new Map<string, string>()

  return {
    async readFile(path: string): Promise<string> {
      const content = files.get(path)
      if (content === undefined) throw new Error(`File not found: ${path}`)
      return content
    },
    async writeFile(path: string, content: string): Promise<void> {
      files.set(path, content)
    },
    async deleteFile(path: string): Promise<void> {
      files.delete(path)
    },
    async exists(path: string): Promise<boolean> {
      return files.has(path)
    },
    async listFiles(_directory: string, _pattern?: string): Promise<string[]> {
      return []
    },
    async listDirectories(_directory: string): Promise<string[]> {
      return []
    },
    async mkdir(_path: string): Promise<void> {},
    async copyFile(src: string, dest: string): Promise<void> {
      const content = files.get(src)
      if (content === undefined) throw new Error(`File not found: ${src}`)
      files.set(dest, content)
    },
    async moveFile(src: string, dest: string): Promise<void> {
      const content = files.get(src)
      if (content === undefined) throw new Error(`File not found: ${src}`)
      files.set(dest, content)
      files.delete(src)
    },
  }
}

// --- Generators ---

/** Arbitrary userId: non-empty alphanumeric strings */
const userIdArb = fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0)

// --- Property Tests ---

describe('Property 4: Session destroy invalidates token', () => {
  it('for any created session, destroySession then validateSession returns null', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const fs = createInMemoryFs()
        const store = new FileSessionStore('/sessions', fs)

        // Create a session
        const session = await store.createSession(userId)
        expect(session.token).toBeTruthy()

        // Destroy the session
        await store.destroySession(session.token)

        // Validate should now return null
        const result = await store.validateSession(session.token)
        expect(result).toBeNull()
      }),
      { numRuns: 100 },
    )
  })
})
