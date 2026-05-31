import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FileSessionStore, FileSessionStoreFactory } from '@/lib/auth/stores/file'
import { createHash } from 'crypto'
import type { FileSystemAdapter } from '@/lib/fs/adapter'

function createMockFs(): FileSystemAdapter {
  const store = new Map<string, string>()

  return {
    readFile: vi.fn(async (path: string) => {
      const content = store.get(path)
      if (!content) throw new Error(`File not found: ${path}`)
      return content
    }),
    writeFile: vi.fn(async (path: string, content: string) => {
      store.set(path, content)
    }),
    deleteFile: vi.fn(async (path: string) => {
      store.delete(path)
    }),
    exists: vi.fn(async (filePath: string) => {
      if (store.has(filePath)) return true
      // Check if any stored file is under this directory
      const prefix = filePath.endsWith('/') ? filePath : `${filePath}/`
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) return true
      }
      return false
    }),
    listFiles: vi.fn(async (directory: string, _pattern?: string) => {
      const prefix = directory.endsWith('/') ? directory : `${directory}/`
      const files: string[] = []
      for (const key of store.keys()) {
        if (key.startsWith(prefix) && key.endsWith('.json')) {
          files.push(key.slice(prefix.length))
        }
      }
      return files
    }),
    listDirectories: vi.fn(async () => []),
    mkdir: vi.fn(async () => {}),
    copyFile: vi.fn(async () => {}),
    moveFile: vi.fn(async () => {}),
  }
}

describe('FileSessionStore', () => {
  let store: FileSessionStore
  let mockFs: FileSystemAdapter

  beforeEach(() => {
    mockFs = createMockFs()
    store = new FileSessionStore('/tmp/sessions', mockFs)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('createSession', () => {
    it('returns a session with id, userId, token, and expiresAt', async () => {
      const session = await store.createSession('user-1')
      expect(session.id).toBeDefined()
      expect(session.userId).toBe('user-1')
      expect(session.token).toBeDefined()
      expect(session.expiresAt).toBeDefined()
    })

    it('generates a 64-character hex token (32 bytes)', async () => {
      const session = await store.createSession('user-1')
      expect(session.token).toHaveLength(64)
      expect(session.token).toMatch(/^[0-9a-f]{64}$/)
    })

    it('generates unique tokens for each session', async () => {
      const s1 = await store.createSession('user-1')
      const s2 = await store.createSession('user-1')
      expect(s1.token).not.toBe(s2.token)
      expect(s1.id).not.toBe(s2.id)
    })

    it('sets expiresAt to 24 hours in the future by default', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'))

      const session = await store.createSession('user-1')
      expect(session.expiresAt).toBe('2024-01-16T10:00:00.000Z')
    })

    it('respects custom session duration', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'))

      const oneHourMs = 60 * 60 * 1000
      const shortStore = new FileSessionStore('/tmp/sessions', mockFs, oneHourMs)
      const session = await shortStore.createSession('user-1')
      expect(session.expiresAt).toBe('2024-01-15T11:00:00.000Z')
    })

    it('writes session as JSON to the filesystem using SHA-256 hash filename', async () => {
      const session = await store.createSession('user-1')
      const hash = createHash('sha256').update(session.token).digest('hex')
      const expectedPath = `/tmp/sessions/${hash}.json`

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expectedPath,
        expect.any(String)
      )

      const writtenContent = (mockFs.writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1]
      const parsed = JSON.parse(writtenContent)
      expect(parsed.id).toBe(session.id)
      expect(parsed.userId).toBe('user-1')
      expect(parsed.token).toBe(session.token)
      expect(parsed.expiresAt).toBe(session.expiresAt)
    })
  })

  describe('validateSession', () => {
    it('returns the session for a valid token', async () => {
      const created = await store.createSession('user-1')
      const validated = await store.validateSession(created.token)
      expect(validated).toEqual(created)
    })

    it('returns null for an unknown token', async () => {
      const result = await store.validateSession('nonexistent-token')
      expect(result).toBeNull()
    })

    it('returns null for an expired session and removes the file', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'))

      const session = await store.createSession('user-1')

      // Advance time past expiry
      vi.setSystemTime(new Date('2024-01-16T10:00:00.001Z'))

      const result = await store.validateSession(session.token)
      expect(result).toBeNull()

      const hash = createHash('sha256').update(session.token).digest('hex')
      expect(mockFs.deleteFile).toHaveBeenCalledWith(`/tmp/sessions/${hash}.json`)
    })

    it('returns null when session expires exactly at expiresAt', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'))

      const session = await store.createSession('user-1')

      vi.setSystemTime(new Date('2024-01-16T10:00:00.000Z'))

      const result = await store.validateSession(session.token)
      expect(result).toBeNull()
    })
  })

  describe('destroySession', () => {
    it('removes the session so it can no longer be validated', async () => {
      const session = await store.createSession('user-1')
      await store.destroySession(session.token)
      const result = await store.validateSession(session.token)
      expect(result).toBeNull()
    })

    it('does not throw when destroying a non-existent token', async () => {
      await expect(store.destroySession('nonexistent')).resolves.not.toThrow()
    })
  })

  describe('cleanExpired', () => {
    it('removes all expired sessions and returns count', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'))

      await store.createSession('user-1')
      await store.createSession('user-2')

      // Advance past expiry
      vi.setSystemTime(new Date('2024-01-16T10:00:00.001Z'))

      // Create a fresh session that should survive
      const s3 = await store.createSession('user-3')

      const removed = await store.cleanExpired()
      expect(removed).toBe(2)

      // Fresh session still valid
      const validated = await store.validateSession(s3.token)
      expect(validated).toEqual(s3)
    })

    it('returns 0 when sessions directory does not exist', async () => {
      const emptyFs = createMockFs()
      ;(emptyFs.exists as ReturnType<typeof vi.fn>).mockResolvedValue(false)
      const emptyStore = new FileSessionStore('/tmp/empty', emptyFs)

      const removed = await emptyStore.cleanExpired()
      expect(removed).toBe(0)
    })

    it('does nothing when there are no expired sessions', async () => {
      await store.createSession('user-1')
      const removed = await store.cleanExpired()
      expect(removed).toBe(0)
    })
  })

  describe('FileSessionStoreFactory', () => {
    it('creates a FileSessionStore with default config', () => {
      const factory = new FileSessionStoreFactory(mockFs)
      const created = factory.create({})
      expect(created).toBeInstanceOf(FileSessionStore)
    })

    it('passes sessionsDir from config', async () => {
      const factory = new FileSessionStoreFactory(mockFs)
      const created = factory.create({ sessionsDir: '/custom/path' })
      const session = await created.createSession('user-1')

      const hash = createHash('sha256').update(session.token).digest('hex')
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        `/custom/path/${hash}.json`,
        expect.any(String)
      )
    })

    it('passes sessionDurationMs from config', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'))

      const factory = new FileSessionStoreFactory(mockFs)
      const oneHour = 60 * 60 * 1000
      const created = factory.create({ sessionDurationMs: oneHour })
      const session = await created.createSession('user-1')

      expect(session.expiresAt).toBe('2024-01-15T11:00:00.000Z')
    })
  })
})
