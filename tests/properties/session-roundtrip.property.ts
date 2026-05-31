// Feature: auth-adapter-system, Property 2: Session create/validate round-trip

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { FileSessionStore } from '@/lib/auth/stores/file'
import type { FileSystemAdapter } from '@/lib/fs/adapter'

/**
 * Validates: Requirements 2.2, 2.3
 *
 * Property: For any userId, creating a session via SessionStore.createSession(userId)
 * and then immediately calling validateSession with the returned token SHALL return
 * a Session with matching id, userId, token, and a future expiresAt timestamp.
 */

// --- In-Memory FileSystemAdapter Mock ---

function createInMemoryFs(): FileSystemAdapter {
  const store = new Map<string, string>()

  return {
    async readFile(path: string): Promise<string> {
      const content = store.get(path)
      if (content === undefined) {
        throw new Error(`File not found: ${path}`)
      }
      return content
    },
    async writeFile(path: string, content: string): Promise<void> {
      store.set(path, content)
    },
    async deleteFile(path: string): Promise<void> {
      store.delete(path)
    },
    async exists(path: string): Promise<boolean> {
      return store.has(path)
    },
    async listFiles(directory: string, _pattern?: string): Promise<string[]> {
      const prefix = directory.endsWith('/') ? directory : `${directory}/`
      return Array.from(store.keys())
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length))
    },
    async listDirectories(): Promise<string[]> {
      return []
    },
    async mkdir(): Promise<void> {},
    async copyFile(): Promise<void> {},
    async moveFile(): Promise<void> {},
  }
}

// --- Generators ---

/**
 * Generate non-empty userId strings (alphanumeric + hyphens, like UUIDs or slugs).
 */
const userIdArb = fc.stringMatching(/^[a-zA-Z0-9_-]{1,64}$/)

// --- Property Tests ---

describe('Property 2: Session create/validate round-trip', () => {
  it('createSession then validateSession returns matching Session', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const fs = createInMemoryFs()
        const store = new FileSessionStore('/sessions', fs)

        // Create a session
        const created = await store.createSession(userId)

        // Validate the session with the returned token
        const validated = await store.validateSession(created.token)

        // Validated session must not be null
        expect(validated).not.toBeNull()

        // Session fields must match
        expect(validated!.id).toBe(created.id)
        expect(validated!.userId).toBe(created.userId)
        expect(validated!.userId).toBe(userId)
        expect(validated!.token).toBe(created.token)
        expect(validated!.expiresAt).toBe(created.expiresAt)

        // expiresAt must be a valid future ISO timestamp
        const expiresAt = new Date(validated!.expiresAt)
        expect(expiresAt.getTime()).toBeGreaterThan(Date.now())
        expect(validated!.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      }),
      { numRuns: 50 },
    )
  })
})
