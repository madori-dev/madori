import * as fs from 'fs/promises'
import * as path from 'path'
import { glob } from 'glob'
import { FileSystemError } from '@/lib/errors'

export interface FileSystemAdapter {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  deleteFile(path: string): Promise<void>
  exists(path: string): Promise<boolean>
  listFiles(directory: string, pattern?: string): Promise<string[]>
  listDirectories(directory: string): Promise<string[]>
  mkdir(path: string): Promise<void>
  copyFile(src: string, dest: string): Promise<void>
  moveFile(src: string, dest: string): Promise<void>
}

export class NodeFileSystemAdapter implements FileSystemAdapter {
  async readFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8')
    } catch (error) {
      throw new FileSystemError('readFile', filePath, error instanceof Error ? error : undefined)
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      const dir = path.dirname(filePath)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(filePath, content, 'utf-8')
    } catch (error) {
      throw new FileSystemError('writeFile', filePath, error instanceof Error ? error : undefined)
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath)
    } catch (error) {
      throw new FileSystemError('deleteFile', filePath, error instanceof Error ? error : undefined)
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  async listFiles(directory: string, pattern?: string): Promise<string[]> {
    try {
      await fs.access(directory)
      const globPattern = pattern ?? '**/*'
      const files = await glob(globPattern, {
        cwd: directory,
        nodir: true,
        absolute: false,
      })
      return files.sort()
    } catch (error) {
      if (error instanceof FileSystemError) throw error
      throw new FileSystemError('listFiles', directory, error instanceof Error ? error : undefined)
    }
  }

  async listDirectories(directory: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true })
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    } catch (error) {
      throw new FileSystemError('listDirectories', directory, error instanceof Error ? error : undefined)
    }
  }

  async mkdir(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true })
    } catch (error) {
      throw new FileSystemError('mkdir', dirPath, error instanceof Error ? error : undefined)
    }
  }

  async copyFile(src: string, dest: string): Promise<void> {
    try {
      const dir = path.dirname(dest)
      await fs.mkdir(dir, { recursive: true })
      await fs.copyFile(src, dest)
    } catch (error) {
      throw new FileSystemError('copyFile', src, error instanceof Error ? error : undefined)
    }
  }

  async moveFile(src: string, dest: string): Promise<void> {
    try {
      const dir = path.dirname(dest)
      await fs.mkdir(dir, { recursive: true })
      await fs.rename(src, dest)
    } catch (error) {
      throw new FileSystemError('moveFile', src, error instanceof Error ? error : undefined)
    }
  }
}
