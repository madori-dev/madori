import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import extractZip from 'extract-zip'
import * as tar from 'tar'
import { select } from '@inquirer/prompts'
import { readManifest } from './manifest.js'
import type { ExportManifest } from './manifest.js'
import { resolveProjectPath } from '../utils/resolve-paths.js'

export interface ImportOptions {
  archivePath: string
  /** For non-interactive mode (testing), pre-resolve all conflicts */
  conflictResolution?: 'keep-local' | 'accept-import' | 'skip'
}

export interface ImportResult {
  totalFiles: number
  imported: number
  skipped: number
  conflicts: number
}

type ArchiveFormat = 'zip' | 'tar'

/**
 * Imports a Madori archive (.zip or .tar.gz/.tgz) into the current project.
 *
 * 1. Extract archive to temp directory
 * 2. Read manifest.json to determine expected resources
 * 3. For each resource, check if it already exists locally
 * 4. If conflicts exist, prompt user per-file (or use pre-set resolution)
 * 5. Copy resolved files to project directories
 * 6. Clean up temp directory
 * 7. Return summary
 */
export async function importArchive(options: ImportOptions): Promise<ImportResult> {
  const { archivePath, conflictResolution } = options

  const format = detectFormat(archivePath)
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-import-'))

  try {
    await extractArchive(archivePath, tempDir, format)

    // The archive may contain files at root or inside a subdirectory (e.g. madori-export/)
    const contentRoot = await resolveContentRoot(tempDir)

    const manifest = await readManifest(path.join(contentRoot, 'manifest.json'))
    const allFiles = collectManifestFiles(manifest)

    const result: ImportResult = {
      totalFiles: allFiles.length,
      imported: 0,
      skipped: 0,
      conflicts: 0,
    }

    for (const relativePath of allFiles) {
      const sourcePath = path.join(contentRoot, relativePath)
      const targetPath = resolveProjectPath(relativePath)

      const sourceExists = await fileExists(sourcePath)
      if (!sourceExists) {
        result.skipped++
        continue
      }

      const conflictExists = await fileExists(targetPath)

      if (conflictExists) {
        result.conflicts++
        const resolution = conflictResolution ?? await promptConflictResolution(relativePath)

        if (resolution === 'keep-local' || resolution === 'skip') {
          result.skipped++
          continue
        }
        // 'accept-import' falls through to copy
      }

      await copyFile(sourcePath, targetPath)
      result.imported++
    }

    return result
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
}

/**
 * Detects archive format from file extension.
 */
function detectFormat(archivePath: string): ArchiveFormat {
  const lower = archivePath.toLowerCase()
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
    return 'tar'
  }
  return 'zip'
}

/**
 * Extracts an archive to the specified directory.
 */
async function extractArchive(archivePath: string, targetDir: string, format: ArchiveFormat): Promise<void> {
  if (format === 'zip') {
    await extractZip(archivePath, { dir: targetDir })
  } else {
    await tar.extract({ file: archivePath, cwd: targetDir })
  }
}

/**
 * Collects all file paths from the manifest's resources arrays.
 */
function collectManifestFiles(manifest: ExportManifest): string[] {
  const { blueprints, collections, fieldsets, content } = manifest.resources
  return [...blueprints, ...collections, ...fieldsets, ...content]
}

/**
 * Prompts the user to resolve a file conflict interactively.
 */
async function promptConflictResolution(
  relativePath: string,
): Promise<'keep-local' | 'accept-import' | 'skip'> {
  return select({
    message: `Conflict: "${relativePath}" already exists locally. What would you like to do?`,
    choices: [
      { name: 'Keep local file', value: 'keep-local' as const },
      { name: 'Accept imported file', value: 'accept-import' as const },
      { name: 'Skip this file', value: 'skip' as const },
    ],
  })
}

/**
 * Copies a file from source to target, creating parent directories as needed.
 */
async function copyFile(sourcePath: string, targetPath: string): Promise<void> {
  const dir = path.dirname(targetPath)
  await fs.mkdir(dir, { recursive: true })
  await fs.copyFile(sourcePath, targetPath)
}

/**
 * Checks whether a file exists at the given path.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Resolves the content root inside an extracted archive directory.
 * Archives may place all files at the root or inside a subdirectory (e.g. madori-export/).
 * Returns the path containing manifest.json.
 */
async function resolveContentRoot(extractedDir: string): Promise<string> {
  // Check if manifest.json is at root
  if (await fileExists(path.join(extractedDir, 'manifest.json'))) {
    return extractedDir
  }

  // Check for a single subdirectory containing manifest.json (e.g. madori-export/)
  const entries = await fs.readdir(extractedDir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subPath = path.join(extractedDir, entry.name)
      if (await fileExists(path.join(subPath, 'manifest.json'))) {
        return subPath
      }
    }
  }

  // Fall back to root (will fail at readManifest with a clear error)
  return extractedDir
}
