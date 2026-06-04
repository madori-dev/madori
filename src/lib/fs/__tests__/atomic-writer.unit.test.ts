// Unit tests for AtomicFileWriter
// Validates: Requirements 6.4

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AtomicFileWriter } from '@/lib/fs/atomic-writer'
import type { FileSystemAdapter } from '@/lib/fs/adapter'

/**
 * Unit tests for AtomicFileWriter covering:
 * - Atomic write success path
 * - Rename failure fallback (original preserved)
 * - Write failure (immediate error return)
 * - Orphan detection (files found)
 * - Orphan detection (no files found)
 */

function createMockFs(): FileSystemAdapter {
  return {
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn(),
    listFiles: vi.fn().mockResolvedValue([]),
    listDirectories: vi.fn(),
    mkdir: vi.fn(),
    copyFile: vi.fn(),
    moveFile: vi.fn().mockResolvedValue(undefined),
  }
}

describe('AtomicFileWriter', () => {
  let mockFs: ReturnType<typeof createMockFs>
  let writer: AtomicFileWriter

  beforeEach(() => {
    mockFs = createMockFs()
    writer = new AtomicFileWriter(mockFs)
  })

  describe('writeFileAtomic', () => {
    it('returns success when writeFile and moveFile both succeed', async () => {
      const result = await writer.writeFileAtomic('/content/posts/hello.md', '# Hello')

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()

      // writeFile called with a temp path in the same directory
      expect(mockFs.writeFile).toHaveBeenCalledTimes(1)
      const writtenPath = vi.mocked(mockFs.writeFile).mock.calls[0][0]
      expect(writtenPath).toMatch(/^\/content\/posts\/hello\.md\.tmp\.[a-f0-9]{16}$/)
      expect(vi.mocked(mockFs.writeFile).mock.calls[0][1]).toBe('# Hello')

      // moveFile called with temp → target
      expect(mockFs.moveFile).toHaveBeenCalledTimes(1)
      expect(vi.mocked(mockFs.moveFile).mock.calls[0][0]).toBe(writtenPath)
      expect(vi.mocked(mockFs.moveFile).mock.calls[0][1]).toBe('/content/posts/hello.md')
    })

    it('returns failure and deletes temp file when moveFile throws', async () => {
      const renameError = new Error('EXDEV: cross-device link not permitted')
      vi.mocked(mockFs.moveFile).mockRejectedValue(renameError)

      const result = await writer.writeFileAtomic('/data/entry.md', 'content')

      expect(result.success).toBe(false)
      expect(result.error).toBe(renameError)
      expect(result.tempPath).toMatch(/^\/data\/entry\.md\.tmp\.[a-f0-9]{16}$/)

      // Temp file should be cleaned up
      expect(mockFs.deleteFile).toHaveBeenCalledTimes(1)
      expect(vi.mocked(mockFs.deleteFile).mock.calls[0][0]).toBe(result.tempPath)
    })

    it('returns failure immediately when writeFile throws (no moveFile or deleteFile called)', async () => {
      const writeError = new Error('ENOSPC: no space left on device')
      vi.mocked(mockFs.writeFile).mockRejectedValue(writeError)

      const result = await writer.writeFileAtomic('/data/entry.md', 'content')

      expect(result.success).toBe(false)
      expect(result.error).toBe(writeError)
      expect(result.tempPath).toMatch(/^\/data\/entry\.md\.tmp\.[a-f0-9]{16}$/)

      // moveFile and deleteFile should never be called
      expect(mockFs.moveFile).not.toHaveBeenCalled()
      expect(mockFs.deleteFile).not.toHaveBeenCalled()
    })

    it('handles deleteFile failure gracefully during rename fallback', async () => {
      vi.mocked(mockFs.moveFile).mockRejectedValue(new Error('rename failed'))
      vi.mocked(mockFs.deleteFile).mockRejectedValue(new Error('delete also failed'))

      const result = await writer.writeFileAtomic('/data/entry.md', 'content')

      // Should still return failure without throwing
      expect(result.success).toBe(false)
      expect(result.error?.message).toBe('rename failed')
    })
  })

  describe('detectOrphans', () => {
    it('returns absolute paths for orphaned temp files', async () => {
      vi.mocked(mockFs.listFiles).mockResolvedValue([
        'entry.md.tmp.abc12345',
        'page.md.tmp.def67890',
      ])

      const orphans = await writer.detectOrphans('/content/posts')

      expect(orphans).toEqual([
        '/content/posts/entry.md.tmp.abc12345',
        '/content/posts/page.md.tmp.def67890',
      ])

      // listFiles called with directory and glob pattern
      expect(mockFs.listFiles).toHaveBeenCalledWith('/content/posts', '*.tmp.*')
    })

    it('returns empty array when no orphaned temp files exist', async () => {
      vi.mocked(mockFs.listFiles).mockResolvedValue([])

      const orphans = await writer.detectOrphans('/content/posts')

      expect(orphans).toEqual([])
      expect(mockFs.listFiles).toHaveBeenCalledWith('/content/posts', '*.tmp.*')
    })
  })
})
