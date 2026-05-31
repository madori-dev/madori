import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { FileSessionStore } from '@/lib/auth/stores/file'
import type { FileSystemAdapter } from '@/lib/fs/adapter'

/**
 * Property 5: FileSessionStore persistence round-trip
 *
 * For any created session, the corresponding JSON file SHALL exist on disk
 * and contain a valid JSON object with fields matching the returned Session
 * (id, userId, token, expiresAt).
 *
 * **Validates: Requirements 3.2, 3.3**
 */

/**
 * Mock FileSystemAdapter that captures all writes so we can inspect
 * the JSON content written to disk.
 */
function createCapturingFs(): FileSystemAdapter & { written: Map<string, string> } {
  const written = new Map<string, string>()

  return {
    written,
    async readFile(path: string): Promise<string> {
      const content = written.get(path)
      if (!content) throw new Error(`File not found: ${path}`)
      return content
    },
    async writeFile(path: string, content: string): Promise<void> {
      written.set(path, content)
    },
    async deleteFile(path: string): Promise<void> {
      written.delete(path)
    },
    async exists(path: string): Promise<boolean> {
      return written.has(path)
    },
    async listFiles(): Promise<string[]> {
      return []
    },
    async listDirectories(): Promise<string[]> {
      return []
    },
    async mkdir(): Promise<void> {},
    async copyFile(): Promise<void> {},
    async moveFile(): Promise<void> {},
  }
}

describe('Property 5: FileSessionStore persistence round-trip', () => {
  it('for any userId, createSession writes a JSON file with matching id, userId, token, expiresAt', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0),
        async (userId) => {
          const mockFs = createCapturingFs()
          const store = new FileSessionStore('/sessions', mockFs)

          const session = await store.createSession(userId)

          // Exactly one file should have been written
          expect(mockFs.written.size).toBe(1)

          // Get the written content
          const [filePath, fileContent] = [...mockFs.written.entries()][0]

          // File should be in the sessions directory
          expect(filePath.startsWith('/sessions/')).toBe(true)
          expect(filePath.endsWith('.json')).toBe(true)

          // Content should be valid JSON
          const parsed = JSON.parse(fileContent)

          // All four fields must match the returned session
          expect(parsed.id).toBe(session.id)
          expect(parsed.userId).toBe(session.userId)
          expect(parsed.token).toBe(session.token)
          expect(parsed.expiresAt).toBe(session.expiresAt)
        }
      ),
      { numRuns: 100 }
    )
  })
})
