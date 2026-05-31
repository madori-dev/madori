// Feature: auth-adapter-system, Property 3: Invalid token validation returns null

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fc from 'fast-check'
import { FileSessionStore } from '@/lib/auth/stores/file'
import type { FileSystemAdapter } from '@/lib/fs/adapter'

/**
 * Validates: Requirements 2.4, 2.5
 *
 * Property: For any token that was never created by the SessionStore, or that
 * corresponds to an expired session, calling validateSession SHALL return null.
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
    async listFiles(directory: string, _pattern?: string): Promise<string[]> {
      const prefix = directory.endsWith('/') ? directory : `${directory}/`
      return Array.from(files.keys())
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
 * Generate arbitrary string tokens that are unlikely to match a real
 * cryptographically generated token (64-character hex string).
 */
const arbitraryTokenArb = fc.string({ minLength: 1, maxLength: 128 })

const userIdArb = fc.string({ minLength: 1, maxLength: 64 })

// --- Property Tests ---

describe('Property 3: Invalid token validation returns null', () => {
  let store: FileSessionStore
  let memFs: FileSystemAdapter

  beforeEach(() => {
    memFs = createInMemoryFs()
    store = new FileSessionStore('/sessions', memFs)
  })

  it('for any arbitrary token never created, validateSession returns null', async () => {
    await fc.assert(
      fc.asyncProperty(arbitraryTokenArb, async (token) => {
        const result = await store.validateSession(token)
        expect(result).toBeNull()
      }),
      { numRuns: 100 },
    )
  })

  it('for an expired session, validateSession returns null', async () => {
    vi.useFakeTimers()

    try {
      await fc.assert(
        fc.asyncProperty(userIdArb, async (userId) => {
          // Create a store with very short duration (1ms)
          const shortLivedStore = new FileSessionStore('/sessions', memFs, 1)

          // Create a session
          const session = await shortLivedStore.createSession(userId)

          // Advance time past expiry
          vi.advanceTimersByTime(10)

          // Validate should return null for expired session
          const result = await shortLivedStore.validateSession(session.token)
          expect(result).toBeNull()
        }),
        { numRuns: 50 },
      )
    } finally {
      vi.useRealTimers()
    }
  })
})
