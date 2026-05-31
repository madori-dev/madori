// Feature: auth-adapter-system, Property 6: FileSessionStore cleanup removes only expired sessions

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { FileSessionStore } from '@/lib/auth/stores/file'
import type { FileSystemAdapter } from '@/lib/fs/adapter'

/**
 * Validates: Requirements 3.6
 *
 * Property: For any set of session files in the sessions directory where some
 * are expired and some are not, calling cleanExpired SHALL remove all and only
 * the expired session files, leaving valid sessions intact.
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
      if (files.has(path)) return true
      // Check if path is a directory (any file starts with path/)
      const prefix = path.endsWith('/') ? path : path + '/'
      for (const key of files.keys()) {
        if (key.startsWith(prefix)) return true
      }
      return false
    },
    async listFiles(directory: string, _pattern?: string): Promise<string[]> {
      const prefix = directory.endsWith('/') ? directory : directory + '/'
      const result: string[] = []
      for (const key of files.keys()) {
        if (key.startsWith(prefix) && key.endsWith('.json')) {
          // Return just the filename (relative to directory)
          result.push(key.slice(prefix.length))
        }
      }
      return result
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

/** Generate a valid userId (non-empty alphanumeric string) */
const userIdArb = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0)

/** Generate a count of sessions to create in each category */
const sessionCountArb = fc.integer({ min: 1, max: 5 })

// --- Property Tests ---

describe('Property 6: FileSessionStore cleanup removes only expired sessions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('cleanExpired removes all expired sessions and leaves all valid sessions intact', async () => {
    await fc.assert(
      fc.asyncProperty(
        sessionCountArb,
        sessionCountArb,
        userIdArb,
        async (expiredCount, validCount, userId) => {
          // Set a known starting time
          const baseTime = new Date('2025-01-01T00:00:00.000Z').getTime()
          vi.setSystemTime(baseTime)

          const inMemoryFs = createInMemoryFs()
          const sessionsDir = '/tmp/sessions'
          const shortDurationMs = 1000 // 1 second sessions for expired ones
          const longDurationMs = 60 * 60 * 1000 // 1 hour for valid ones

          // Create expired sessions with short duration
          const shortStore = new FileSessionStore(sessionsDir, inMemoryFs, shortDurationMs)
          const expiredTokens: string[] = []

          for (let i = 0; i < expiredCount; i++) {
            const session = await shortStore.createSession(userId)
            expiredTokens.push(session.token)
          }

          // Advance time past the short duration so those sessions expire
          vi.setSystemTime(baseTime + shortDurationMs + 1)

          // Create valid sessions with long duration (created AFTER time advance, so still valid)
          const longStore = new FileSessionStore(sessionsDir, inMemoryFs, longDurationMs)
          const validTokens: string[] = []

          for (let i = 0; i < validCount; i++) {
            const session = await longStore.createSession(userId)
            validTokens.push(session.token)
          }

          // Run cleanExpired using any store (they share the same fs and dir)
          const removed = await longStore.cleanExpired()

          // All expired sessions should have been removed
          expect(removed).toBe(expiredCount)

          // Expired sessions should return null from validateSession
          for (const token of expiredTokens) {
            const result = await longStore.validateSession(token)
            expect(result).toBeNull()
          }

          // Valid sessions should still be accessible
          for (const token of validTokens) {
            const result = await longStore.validateSession(token)
            expect(result).not.toBeNull()
            expect(result!.token).toBe(token)
            expect(result!.userId).toBe(userId)
          }
        },
      ),
      { numRuns: 50 },
    )
  })
})
