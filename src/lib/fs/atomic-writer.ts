import * as path from 'path'
import * as crypto from 'crypto'
import type { FileSystemAdapter } from './adapter'

export interface AtomicWriteResult {
  success: boolean
  tempPath?: string
  error?: Error
}

export class AtomicFileWriter {
  constructor(private readonly fs: FileSystemAdapter) {}

  /**
   * Write content to a file atomically using write-to-temp + rename.
   * Writes to a temporary file in the same directory, then renames
   * atomically to the target path. On rename failure, the temp file
   * is deleted and the original file is preserved.
   */
  async writeFileAtomic(targetPath: string, content: string): Promise<AtomicWriteResult> {
    const dir = path.dirname(targetPath)
    const basename = path.basename(targetPath)
    const randomSuffix = crypto.randomBytes(8).toString('hex')
    const tempPath = path.join(dir, `${basename}.tmp.${randomSuffix}`)

    try {
      await this.fs.writeFile(tempPath, content)
    } catch (error) {
      return {
        success: false,
        tempPath,
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }

    try {
      await this.fs.moveFile(tempPath, targetPath)
    } catch (error) {
      // Rename failed — clean up temp file and preserve original
      try {
        await this.fs.deleteFile(tempPath)
      } catch {
        // Best-effort cleanup; temp file may already be gone
      }

      return {
        success: false,
        tempPath,
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }

    return { success: true }
  }

  /**
   * Detect orphaned temporary files from interrupted writes.
   * Scans the given directory for files matching the `.tmp.*` pattern.
   * Returns absolute paths of orphaned temp files.
   */
  async detectOrphans(directory: string): Promise<string[]> {
    const files = await this.fs.listFiles(directory, '*.tmp.*')
    return files.map((file) => path.join(directory, file))
  }
}
