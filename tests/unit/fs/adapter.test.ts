import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { FileSystemError } from '@/lib/errors'

describe('NodeFileSystemAdapter', () => {
  let adapter: NodeFileSystemAdapter
  let tmpDir: string

  beforeEach(async () => {
    adapter = new NodeFileSystemAdapter()
    tmpDir = path.join(process.cwd(), 'tests', '.tmp', `test-${Date.now()}`)
    await fs.mkdir(tmpDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('readFile', () => {
    it('reads file content as utf-8 string', async () => {
      const filePath = path.join(tmpDir, 'test.txt')
      await fs.writeFile(filePath, 'hello world', 'utf-8')

      const content = await adapter.readFile(filePath)
      expect(content).toBe('hello world')
    })

    it('reads file with unicode content', async () => {
      const filePath = path.join(tmpDir, 'unicode.txt')
      const unicodeContent = '日本語テスト\nÜnïcödé\nالعربية\n中文内容\nEmoji: 🎉🚀'
      await fs.writeFile(filePath, unicodeContent, 'utf-8')

      const content = await adapter.readFile(filePath)
      expect(content).toBe(unicodeContent)
    })

    it('throws FileSystemError for missing file', async () => {
      const filePath = path.join(tmpDir, 'nonexistent.txt')

      await expect(adapter.readFile(filePath)).rejects.toThrow(FileSystemError)
      await expect(adapter.readFile(filePath)).rejects.toMatchObject({
        code: 'FILE_SYSTEM_ERROR',
      })
    })
  })

  describe('writeFile', () => {
    it('writes content to file', async () => {
      const filePath = path.join(tmpDir, 'output.txt')
      await adapter.writeFile(filePath, 'written content')

      const content = await fs.readFile(filePath, 'utf-8')
      expect(content).toBe('written content')
    })

    it('creates parent directories if they do not exist', async () => {
      const filePath = path.join(tmpDir, 'nested', 'deep', 'file.txt')
      await adapter.writeFile(filePath, 'nested content')

      const content = await fs.readFile(filePath, 'utf-8')
      expect(content).toBe('nested content')
    })

    it('overwrites existing file', async () => {
      const filePath = path.join(tmpDir, 'overwrite.txt')
      await fs.writeFile(filePath, 'original', 'utf-8')

      await adapter.writeFile(filePath, 'updated')
      const content = await fs.readFile(filePath, 'utf-8')
      expect(content).toBe('updated')
    })
  })

  describe('deleteFile', () => {
    it('removes an existing file', async () => {
      const filePath = path.join(tmpDir, 'to-delete.txt')
      await fs.writeFile(filePath, 'delete me', 'utf-8')

      await adapter.deleteFile(filePath)

      await expect(fs.access(filePath)).rejects.toThrow()
    })

    it('throws FileSystemError for missing file', async () => {
      const filePath = path.join(tmpDir, 'nonexistent.txt')

      await expect(adapter.deleteFile(filePath)).rejects.toThrow(FileSystemError)
    })
  })

  describe('exists', () => {
    it('returns true for existing file', async () => {
      const filePath = path.join(tmpDir, 'exists.txt')
      await fs.writeFile(filePath, '', 'utf-8')

      expect(await adapter.exists(filePath)).toBe(true)
    })

    it('returns true for existing directory', async () => {
      expect(await adapter.exists(tmpDir)).toBe(true)
    })

    it('returns false for nonexistent path', async () => {
      expect(await adapter.exists(path.join(tmpDir, 'nope'))).toBe(false)
    })
  })

  describe('listFiles', () => {
    beforeEach(async () => {
      await fs.writeFile(path.join(tmpDir, 'a.md'), '', 'utf-8')
      await fs.writeFile(path.join(tmpDir, 'b.txt'), '', 'utf-8')
      await fs.mkdir(path.join(tmpDir, 'sub'), { recursive: true })
      await fs.writeFile(path.join(tmpDir, 'sub', 'c.md'), '', 'utf-8')
    })

    it('lists all files recursively by default', async () => {
      const files = await adapter.listFiles(tmpDir)
      expect(files).toContain('a.md')
      expect(files).toContain('b.txt')
      expect(files).toContain('sub/c.md')
    })

    it('filters files by glob pattern', async () => {
      const files = await adapter.listFiles(tmpDir, '**/*.md')
      expect(files).toContain('a.md')
      expect(files).toContain('sub/c.md')
      expect(files).not.toContain('b.txt')
    })

    it('returns empty array for empty directory', async () => {
      const emptyDir = path.join(tmpDir, 'empty')
      await fs.mkdir(emptyDir, { recursive: true })

      const files = await adapter.listFiles(emptyDir)
      expect(files).toEqual([])
    })

    it('throws FileSystemError for nonexistent directory', async () => {
      await expect(
        adapter.listFiles(path.join(tmpDir, 'nonexistent'))
      ).rejects.toThrow(FileSystemError)
    })
  })

  describe('listDirectories', () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(tmpDir, 'dir-a'), { recursive: true })
      await fs.mkdir(path.join(tmpDir, 'dir-b'), { recursive: true })
      await fs.writeFile(path.join(tmpDir, 'file.txt'), '', 'utf-8')
    })

    it('lists only directories', async () => {
      const dirs = await adapter.listDirectories(tmpDir)
      expect(dirs).toContain('dir-a')
      expect(dirs).toContain('dir-b')
      expect(dirs).not.toContain('file.txt')
    })

    it('returns sorted directory names', async () => {
      const dirs = await adapter.listDirectories(tmpDir)
      expect(dirs).toEqual([...dirs].sort())
    })

    it('throws FileSystemError for nonexistent directory', async () => {
      await expect(
        adapter.listDirectories(path.join(tmpDir, 'nonexistent'))
      ).rejects.toThrow(FileSystemError)
    })
  })

  describe('mkdir', () => {
    it('creates a directory', async () => {
      const dirPath = path.join(tmpDir, 'new-dir')
      await adapter.mkdir(dirPath)

      const stat = await fs.stat(dirPath)
      expect(stat.isDirectory()).toBe(true)
    })

    it('creates nested directories recursively', async () => {
      const dirPath = path.join(tmpDir, 'a', 'b', 'c')
      await adapter.mkdir(dirPath)

      const stat = await fs.stat(dirPath)
      expect(stat.isDirectory()).toBe(true)
    })

    it('does not throw if directory already exists', async () => {
      await adapter.mkdir(tmpDir)
      // Should not throw
    })
  })

  describe('copyFile', () => {
    it('copies file to destination', async () => {
      const src = path.join(tmpDir, 'source.txt')
      const dest = path.join(tmpDir, 'copy.txt')
      await fs.writeFile(src, 'copy me', 'utf-8')

      await adapter.copyFile(src, dest)

      const content = await fs.readFile(dest, 'utf-8')
      expect(content).toBe('copy me')
      // Source still exists
      const srcContent = await fs.readFile(src, 'utf-8')
      expect(srcContent).toBe('copy me')
    })

    it('creates parent directories for destination', async () => {
      const src = path.join(tmpDir, 'source.txt')
      const dest = path.join(tmpDir, 'nested', 'copy.txt')
      await fs.writeFile(src, 'nested copy', 'utf-8')

      await adapter.copyFile(src, dest)

      const content = await fs.readFile(dest, 'utf-8')
      expect(content).toBe('nested copy')
    })

    it('throws FileSystemError for missing source', async () => {
      const src = path.join(tmpDir, 'nonexistent.txt')
      const dest = path.join(tmpDir, 'copy.txt')

      await expect(adapter.copyFile(src, dest)).rejects.toThrow(FileSystemError)
    })
  })

  describe('moveFile', () => {
    it('moves file to destination', async () => {
      const src = path.join(tmpDir, 'source.txt')
      const dest = path.join(tmpDir, 'moved.txt')
      await fs.writeFile(src, 'move me', 'utf-8')

      await adapter.moveFile(src, dest)

      const content = await fs.readFile(dest, 'utf-8')
      expect(content).toBe('move me')
      // Source no longer exists
      await expect(fs.access(src)).rejects.toThrow()
    })

    it('creates parent directories for destination', async () => {
      const src = path.join(tmpDir, 'source.txt')
      const dest = path.join(tmpDir, 'nested', 'moved.txt')
      await fs.writeFile(src, 'nested move', 'utf-8')

      await adapter.moveFile(src, dest)

      const content = await fs.readFile(dest, 'utf-8')
      expect(content).toBe('nested move')
    })

    it('throws FileSystemError for missing source', async () => {
      const src = path.join(tmpDir, 'nonexistent.txt')
      const dest = path.join(tmpDir, 'moved.txt')

      await expect(adapter.moveFile(src, dest)).rejects.toThrow(FileSystemError)
    })
  })

  describe('concurrent operations', () => {
    it('handles concurrent writes to different files', async () => {
      const writes = Array.from({ length: 10 }, (_, i) => {
        const filePath = path.join(tmpDir, `concurrent-${i}.txt`)
        return adapter.writeFile(filePath, `content-${i}`)
      })

      await expect(Promise.all(writes)).resolves.not.toThrow()

      // Verify all files were written correctly
      for (let i = 0; i < 10; i++) {
        const filePath = path.join(tmpDir, `concurrent-${i}.txt`)
        const content = await fs.readFile(filePath, 'utf-8')
        expect(content).toBe(`content-${i}`)
      }
    })

    it('handles concurrent writes to the same file (last write wins)', async () => {
      const filePath = path.join(tmpDir, 'same-file.txt')

      // Write concurrently - all should complete without error
      const writes = Array.from({ length: 5 }, (_, i) =>
        adapter.writeFile(filePath, `version-${i}`)
      )

      await expect(Promise.all(writes)).resolves.not.toThrow()

      // File should contain one of the written values
      const content = await fs.readFile(filePath, 'utf-8')
      expect(content).toMatch(/^version-\d$/)
    })
  })
})
