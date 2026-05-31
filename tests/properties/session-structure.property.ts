// Feature: auth-adapter-system, Property 15: Session data structure invariant

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { FileSessionStore } from '@/lib/auth/stores/file'
import type { FileSystemAdapter } from '@/lib/fs/adapter'

/**
 * Validates: Requirements 8.3
 *
 * Property: For any SessionStore implementation, every Session returned by
 * createSession or validateSession SHALL contain non-empty id, userId, token,
 * and a valid ISO 8601 expiresAt string.
 */

// --- Helpers ---

function createInMemoryFs(): FileSystemAdapter {
  const store = new Map<string, string>()

  return {
    readFile: async (path: string) => {
      const content = store.get(path)
      if (!content) throw new Error(`File not found: ${path}`)
      return content
    },
    writeFile: async (path: string, content: string) => {
      store.set(path, content)
    },
    deleteFile: async (path: string) => {
      store.delete(path)
    },
    exists: async (filePath: string) => {
      if (store.has(filePath)) return true
      const prefix = filePath.endsWith('/') ? filePath : `${filePath}/`
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) return true
      }
      return false
    },
    listFiles: async (directory: string) => {
      const prefix = directory.endsWith('/') ? directory : `${directory}/`
      const files: string[] = []
      for (const key of store.keys()) {
        if (key.startsWith(prefix) && key.endsWith('.json')) {
          files.push(key.slice(prefix.length))
        }
      }
      return files
    },
    listDirectories: async () => [],
    mkdir: async () => {},
    copyFile: async () => {},
    moveFile: async () => {},
  }
}

const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/

function isValidIso8601(str: string): boolean {
  if (!ISO_8601_REGEX.test(str)) return false
  const date = new Date(str)
  return !isNaN(date.getTime())
}

// --- Generators ---

/**
 * Generate non-empty userId strings representing realistic user identifiers.
 */
const userIdArb = fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0)

// --- Property Tests ---

describe('Property 15: Session data structure invariant', () => {
  it('createSession returns a session with non-empty id, userId, token (64 hex chars), and valid ISO 8601 expiresAt in the future', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const fs = createInMemoryFs()
        const store = new FileSessionStore('/sessions', fs)

        const session = await store.createSession(userId)

        // Non-empty id
        expect(session.id).toBeDefined()
        expect(session.id.length).toBeGreaterThan(0)

        // userId matches input
        expect(session.userId).toBe(userId)

        // Token is 64 hex chars (32 random bytes)
        expect(session.token).toMatch(/^[0-9a-f]{64}$/)

        // expiresAt is valid ISO 8601 in the future
        expect(isValidIso8601(session.expiresAt)).toBe(true)
        expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now())
      }),
      { numRuns: 50 },
    )
  })

  it('validateSession returns a session with the same structural invariants', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const fs = createInMemoryFs()
        const store = new FileSessionStore('/sessions', fs)

        const created = await store.createSession(userId)
        const validated = await store.validateSession(created.token)

        // validateSession should return a non-null session
        expect(validated).not.toBeNull()

        // Non-empty id
        expect(validated!.id).toBeDefined()
        expect(validated!.id.length).toBeGreaterThan(0)

        // userId matches
        expect(validated!.userId).toBe(userId)

        // Token is 64 hex chars
        expect(validated!.token).toMatch(/^[0-9a-f]{64}$/)

        // expiresAt is valid ISO 8601
        expect(isValidIso8601(validated!.expiresAt)).toBe(true)
        expect(new Date(validated!.expiresAt).getTime()).toBeGreaterThan(Date.now())
      }),
      { numRuns: 50 },
    )
  })
})
