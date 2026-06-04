import * as path from 'path'
import * as fs from 'fs/promises'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import { NotFoundError } from '@/lib/errors'
import type { Asset } from '@/lib/types'

/**
 * MIME type mapping from file extension to MIME type string.
 */
const MIME_TYPES: Record<string, string> = {
  // Images
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  ico: 'image/x-icon',
  avif: 'image/avif',

  // Documents
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

  // Video
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',

  // Audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',

  // Web
  html: 'text/html',
  css: 'text/css',
  js: 'application/javascript',
  json: 'application/json',
  xml: 'application/xml',

  // Archives
  zip: 'application/zip',
  tar: 'application/x-tar',
  gz: 'application/gzip',

  // Fonts
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',

  // Text
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
}

/**
 * Input for uploading an asset (server-side compatible, no browser File API).
 */
export interface AssetUploadInput {
  name: string
  content: Buffer | string
  type?: string
}

/**
 * Metadata fields that can be updated on an asset.
 */
export interface AssetMetadataUpdate {
  alt?: string
  filename?: string
}

/**
 * Get MIME type from a file extension.
 */
export function getMimeType(extension: string): string {
  return MIME_TYPES[extension.toLowerCase()] ?? 'application/octet-stream'
}

/**
 * Determine whether an asset should be displayed as a thumbnail or icon
 * based on its MIME type.
 */
export function getDisplayMode(mimeType: string): 'thumbnail' | 'icon' {
  return mimeType.startsWith('image/') ? 'thumbnail' : 'icon'
}

/**
 * Get the appropriate file-type icon name for a given MIME type.
 */
export function getFileTypeIcon(mimeType: string): string {
  const iconMap: Record<string, string> = {
    'application/pdf': 'file-text',
    'application/zip': 'archive',
    'video/': 'video',
    'audio/': 'music',
  }
  for (const [prefix, icon] of Object.entries(iconMap)) {
    if (mimeType.startsWith(prefix)) return icon
  }
  return 'file'
}

/**
 * AssetOperations handles all asset-related file system operations.
 * Assets are stored in the configured assets directory (default: public/assets/).
 */
export class AssetOperations {
  private readonly assetsPath: string
  private readonly fsAdapter: FileSystemAdapter

  constructor(assetsPath: string, fsAdapter: FileSystemAdapter) {
    this.assetsPath = assetsPath
    this.fsAdapter = fsAdapter
  }

  /**
   * Get metadata for a single asset by its relative path.
   * Does NOT read file content — only stat metadata.
   */
  async getAsset(relativePath: string): Promise<Asset | null> {
    const fullPath = path.join(this.assetsPath, relativePath)

    const exists = await this.fsAdapter.exists(fullPath)
    if (!exists) {
      return null
    }

    const stat = await fs.stat(fullPath)
    if (!stat.isFile()) {
      return null
    }

    return this.buildAssetFromStat(relativePath, stat)
  }

  /**
   * List all assets in a given directory (or root assets directory).
   * Returns metadata for each file found.
   */
  async listAssets(directory?: string): Promise<Asset[]> {
    const targetDir = directory
      ? path.join(this.assetsPath, directory)
      : this.assetsPath

    const exists = await this.fsAdapter.exists(targetDir)
    if (!exists) {
      return []
    }

    const files = await this.fsAdapter.listFiles(targetDir, '*')
    const assets: Asset[] = []

    for (const file of files) {
      const relativePath = directory
        ? path.join(directory, file)
        : file
      const fullPath = path.join(this.assetsPath, relativePath)

      try {
        const stat = await fs.stat(fullPath)
        if (stat.isFile()) {
          assets.push(this.buildAssetFromStat(relativePath, stat))
        }
      } catch {
        // Skip files that can't be stat'd
        continue
      }
    }

    return assets
  }

  /**
   * Upload an asset to the assets directory.
   * Accepts server-side input (name, content buffer/string, optional type).
   */
  async uploadAsset(file: AssetUploadInput, directory?: string): Promise<Asset> {
    const relativePath = directory
      ? path.join(directory, file.name)
      : file.name
    const fullPath = path.join(this.assetsPath, relativePath)

    // Ensure the target directory exists
    const targetDir = path.dirname(fullPath)
    await this.fsAdapter.mkdir(targetDir)

    // Write the file content
    await fs.writeFile(fullPath, file.content)

    // Read back the stat to build the asset metadata
    const stat = await fs.stat(fullPath)
    return this.buildAssetFromStat(relativePath, stat)
  }

  /**
   * Delete an asset by its relative path.
   * Throws NotFoundError if the asset doesn't exist.
   */
  async deleteAsset(relativePath: string): Promise<void> {
    const fullPath = path.join(this.assetsPath, relativePath)

    const exists = await this.fsAdapter.exists(fullPath)
    if (!exists) {
      throw new NotFoundError('Asset', relativePath)
    }

    await this.fsAdapter.deleteFile(fullPath)
  }

  /**
   * Move/rename an asset from one relative path to another.
   * Throws NotFoundError if the source doesn't exist.
   */
  async moveAsset(fromPath: string, toPath: string): Promise<Asset> {
    const fullFrom = path.join(this.assetsPath, fromPath)
    const fullTo = path.join(this.assetsPath, toPath)

    const exists = await this.fsAdapter.exists(fullFrom)
    if (!exists) {
      throw new NotFoundError('Asset', fromPath)
    }

    await this.fsAdapter.moveFile(fullFrom, fullTo)

    const stat = await fs.stat(fullTo)
    return this.buildAssetFromStat(toPath, stat)
  }

  /**
   * Move multiple assets to a target directory.
   */
  async bulkMove(paths: string[], destinationDir: string): Promise<Asset[]> {
    const results: Asset[] = []
    for (const assetPath of paths) {
      const filename = path.basename(assetPath)
      const newPath = destinationDir ? path.join(destinationDir, filename) : filename
      const asset = await this.moveAsset(assetPath, newPath)
      results.push(asset)
    }
    return results
  }

  /**
   * Delete multiple assets.
   */
  async bulkDelete(paths: string[]): Promise<void> {
    for (const assetPath of paths) {
      await this.deleteAsset(assetPath)
    }
  }

  /**
   * Create a directory under the assets path.
   */
  async createDirectory(relativePath: string): Promise<void> {
    const fullPath = path.join(this.assetsPath, relativePath)
    await this.fsAdapter.mkdir(fullPath)
  }

  /**
   * Delete an empty directory.
   * Throws if directory is not empty or doesn't exist.
   */
  async deleteDirectory(relativePath: string): Promise<void> {
    const fullPath = path.join(this.assetsPath, relativePath)

    const exists = await this.fsAdapter.exists(fullPath)
    if (!exists) {
      throw new NotFoundError('Directory', relativePath)
    }

    await fs.rmdir(fullPath)
  }

  /**
   * List subdirectories in a given directory (non-recursive).
   */
  async listDirectories(directory?: string): Promise<string[]> {
    const targetDir = directory
      ? path.join(this.assetsPath, directory)
      : this.assetsPath

    const exists = await this.fsAdapter.exists(targetDir)
    if (!exists) {
      return []
    }

    const dirs = await this.fsAdapter.listDirectories(targetDir)
    return dirs
  }

  /**
   * Rename a directory.
   */
  async renameDirectory(oldPath: string, newPath: string): Promise<void> {
    const fullOld = path.join(this.assetsPath, oldPath)
    const fullNew = path.join(this.assetsPath, newPath)

    const exists = await this.fsAdapter.exists(fullOld)
    if (!exists) {
      throw new NotFoundError('Directory', oldPath)
    }

    await fs.rename(fullOld, fullNew)
  }

  /**
   * Update asset metadata (alt text, filename).
   * Stores metadata as a `.meta.yaml` sidecar file alongside the asset.
   * If filename is updated, the asset file is also renamed.
   */
  async updateMetadata(assetPath: string, update: AssetMetadataUpdate): Promise<Asset> {
    const fullPath = path.join(this.assetsPath, assetPath)

    const exists = await this.fsAdapter.exists(fullPath)
    if (!exists) {
      throw new NotFoundError('Asset', assetPath)
    }

    // Read existing metadata if present
    const metaPath = `${fullPath}.meta.yaml`
    let existingMeta: Record<string, unknown> = {}
    const metaExists = await this.fsAdapter.exists(metaPath)
    if (metaExists) {
      const content = await this.fsAdapter.readFile(metaPath)
      existingMeta = (parseYaml(content) as Record<string, unknown>) ?? {}
    }

    // Merge the update into existing metadata
    const merged = { ...existingMeta }
    if (update.alt !== undefined) {
      merged.alt = update.alt
    }
    if (update.filename !== undefined) {
      merged.filename = update.filename
    }

    // Handle file rename if filename changed
    let finalAssetPath = assetPath
    if (update.filename && update.filename !== path.basename(assetPath)) {
      const dir = path.dirname(assetPath)
      const newRelativePath = dir === '.' ? update.filename : path.join(dir, update.filename)
      const newFullPath = path.join(this.assetsPath, newRelativePath)

      await this.fsAdapter.moveFile(fullPath, newFullPath)

      // Move old meta file if it existed
      if (metaExists) {
        await this.fsAdapter.deleteFile(metaPath)
      }

      finalAssetPath = newRelativePath

      // Write meta to the new location
      const newMetaPath = `${newFullPath}.meta.yaml`
      await this.fsAdapter.writeFile(newMetaPath, stringifyYaml(merged))
    } else {
      // Write metadata sidecar
      await this.fsAdapter.writeFile(metaPath, stringifyYaml(merged))
    }

    // Build and return the updated asset
    const finalFullPath = path.join(this.assetsPath, finalAssetPath)
    const stat = await fs.stat(finalFullPath)
    const asset = this.buildAssetFromStat(finalAssetPath, stat)

    // Attach alt from metadata
    if (merged.alt !== undefined) {
      asset.alt = merged.alt as string
    }

    return asset
  }

  /**
   * Read metadata for an asset from its `.meta.yaml` sidecar file.
   */
  async getMetadata(assetPath: string): Promise<Record<string, unknown>> {
    const fullPath = path.join(this.assetsPath, assetPath)
    const metaPath = `${fullPath}.meta.yaml`

    const metaExists = await this.fsAdapter.exists(metaPath)
    if (!metaExists) {
      return {}
    }

    const content = await this.fsAdapter.readFile(metaPath)
    return (parseYaml(content) as Record<string, unknown>) ?? {}
  }

  /**
   * Build an Asset object from a file path and stat result.
   */
  private buildAssetFromStat(relativePath: string, stat: import('fs').Stats): Asset {
    const filename = path.basename(relativePath)
    const extension = path.extname(filename).slice(1) // remove leading dot

    return {
      path: relativePath,
      filename,
      extension,
      size: stat.size,
      mimeType: getMimeType(extension),
      modifiedAt: stat.mtime.toISOString(),
    }
  }
}
