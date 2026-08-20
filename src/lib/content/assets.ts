import * as path from 'path'
import * as fs from 'fs/promises'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import { ConflictError, NotFoundError } from '@/lib/errors'
import type { Asset } from '@/lib/types'
import { AtomicFileWriter } from '@/lib/fs/atomic-writer'
import type { ContentMutationReporter } from '@/lib/mutations'
import { noOpContentMutationReporter } from '@/lib/mutations'

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
  private readonly atomicWriter: AtomicFileWriter

  constructor(assetsPath: string, fsAdapter: FileSystemAdapter, private readonly mutations: ContentMutationReporter = noOpContentMutationReporter) {
    this.assetsPath = path.resolve(assetsPath)
    this.fsAdapter = fsAdapter
    this.atomicWriter = new AtomicFileWriter(fsAdapter)
  }

  /**
   * Get metadata for a single asset by its relative path.
   * Does NOT read file content — only stat metadata.
   */
  async getAsset(relativePath: string): Promise<Asset | null> {
    const fullPath = this.resolveAssetPath(relativePath)

    const exists = await this.fsAdapter.exists(fullPath)
    if (!exists) {
      return null
    }

    const stat = await fs.stat(fullPath)
    if (!stat.isFile()) {
      return null
    }

    return this.attachMetadata(relativePath, this.buildAssetFromStat(relativePath, stat))
  }

  /**
   * List all assets in a given directory (or root assets directory).
   * Returns metadata for each file found.
   */
  async listAssets(directory?: string): Promise<Asset[]> {
    const targetDir = directory
      ? this.resolveAssetPath(directory)
      : this.assetsPath

    const exists = await this.fsAdapter.exists(targetDir)
    if (!exists) {
      return []
    }

    const files = await this.fsAdapter.listFiles(targetDir, '*')
    const assets: Asset[] = []

    for (const file of files) {
      if (file.endsWith('.meta.yaml')) continue
      const relativePath = directory
        ? path.join(directory, file)
        : file
      const fullPath = this.resolveAssetPath(relativePath)

      try {
        const stat = await fs.stat(fullPath)
        if (stat.isFile()) {
          assets.push(await this.attachMetadata(relativePath, this.buildAssetFromStat(relativePath, stat)))
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
    this.validateFilename(file.name)
    const relativePath = directory
      ? path.join(directory, file.name)
      : file.name
    const fullPath = this.resolveAssetPath(relativePath)

    // Ensure the target directory exists
    const targetDir = path.dirname(fullPath)
    await this.fsAdapter.mkdir(targetDir)

    // Write file contents atomically so interrupted uploads cannot leave a
    // partially-written asset at the final path.
    const content = typeof file.content === 'string' ? Buffer.from(file.content) : file.content
    const result = await this.atomicWriter.writeBinaryFileAtomic(fullPath, content)
    if (!result.success) throw result.error ?? new Error(`Could not upload asset: ${file.name}`)

    // Read back the stat to build the asset metadata
    const stat = await fs.stat(fullPath)
    const asset = this.buildAssetFromStat(relativePath, stat)
    this.report('create', [fullPath], 'asset', relativePath, `Uploaded asset ${relativePath}`)
    return asset
  }

  /**
   * Delete an asset by its relative path.
   * Throws NotFoundError if the asset doesn't exist.
   */
  async deleteAsset(relativePath: string): Promise<void> {
    const fullPath = this.resolveAssetPath(relativePath)

    const exists = await this.fsAdapter.exists(fullPath)
    if (!exists) {
      throw new NotFoundError('Asset', relativePath)
    }

    await this.fsAdapter.deleteFile(fullPath)
    this.report('delete', [fullPath], 'asset', relativePath, `Deleted asset ${relativePath}`)
  }

  /**
   * Move/rename an asset from one relative path to another.
   * Throws NotFoundError if the source doesn't exist.
   */
  async moveAsset(fromPath: string, toPath: string): Promise<Asset> {
    const fullFrom = this.resolveAssetPath(fromPath)
    const fullTo = this.resolveAssetPath(toPath)

    const exists = await this.fsAdapter.exists(fullFrom)
    if (!exists) {
      throw new NotFoundError('Asset', fromPath)
    }

    if (fullFrom === fullTo) {
      const stat = await fs.stat(fullFrom)
      return this.buildAssetFromStat(toPath, stat)
    }
    if (await this.fsAdapter.exists(fullTo)) {
      throw new ConflictError(`Asset already exists at "${toPath}"`)
    }

    await this.fsAdapter.moveFile(fullFrom, fullTo)

    const stat = await fs.stat(fullTo)
    const asset = this.buildAssetFromStat(toPath, stat)
    this.report('move', [fullFrom, fullTo], 'asset', toPath, `Moved asset ${fromPath} to ${toPath}`)
    return asset
  }

  /**
   * Move multiple assets to a target directory.
   */
  async bulkMove(paths: string[], destinationDir: string): Promise<Asset[]> {
    const plan = paths.map((from) => ({
      from,
      to: destinationDir ? path.join(destinationDir, path.basename(from)) : path.basename(from),
    }))
    const sources = new Set<string>()
    const destinations = new Set<string>()
    for (const { from, to } of plan) {
      const fullFrom = this.resolveAssetPath(from)
      const fullTo = this.resolveAssetPath(to)
      if (!sources.add(fullFrom)) throw new ConflictError(`Asset "${from}" was included more than once`)
      if (!destinations.add(fullTo)) throw new ConflictError(`Multiple assets would be moved to "${to}"`)
      if (!await this.fsAdapter.exists(fullFrom)) throw new NotFoundError('Asset', from)
      if (fullFrom !== fullTo && await this.fsAdapter.exists(fullTo)) {
        throw new ConflictError(`Asset already exists at "${to}"`)
      }
    }

    const completed: Array<{ from: string; to: string }> = []
    try {
      const results: Asset[] = []
      for (const step of plan) {
        results.push(await this.moveAsset(step.from, step.to))
        if (step.from !== step.to) completed.push(step)
      }
      return results
    } catch (error) {
      for (const step of completed.reverse()) {
        try {
          await this.fsAdapter.moveFile(this.resolveAssetPath(step.to), this.resolveAssetPath(step.from))
        } catch {
          // Best effort rollback; preserve original failure for caller.
        }
      }
      throw error
    }
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
    const fullPath = this.resolveAssetPath(relativePath)
    await this.fsAdapter.mkdir(fullPath)
    this.report('create', [fullPath], 'asset-directory', relativePath, `Created asset directory ${relativePath}`)
  }

  /**
   * Delete an empty directory.
   * Throws if directory is not empty or doesn't exist.
   */
  async deleteDirectory(relativePath: string): Promise<void> {
    const fullPath = this.resolveAssetPath(relativePath)

    const exists = await this.fsAdapter.exists(fullPath)
    if (!exists) {
      throw new NotFoundError('Directory', relativePath)
    }

    await fs.rmdir(fullPath)
    this.report('delete', [fullPath], 'asset-directory', relativePath, `Deleted asset directory ${relativePath}`)
  }

  /**
   * List subdirectories in a given directory (non-recursive).
   */
  async listDirectories(directory?: string): Promise<string[]> {
    const targetDir = directory
      ? this.resolveAssetPath(directory)
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
    const fullOld = this.resolveAssetPath(oldPath)
    const fullNew = this.resolveAssetPath(newPath)

    const exists = await this.fsAdapter.exists(fullOld)
    if (!exists) {
      throw new NotFoundError('Directory', oldPath)
    }
    if (fullOld !== fullNew && await this.fsAdapter.exists(fullNew)) {
      throw new ConflictError(`Directory already exists at "${newPath}"`)
    }

    if (fullOld === fullNew) return

    await fs.rename(fullOld, fullNew)
    this.report('move', [fullOld, fullNew], 'asset-directory', newPath, `Renamed asset directory ${oldPath} to ${newPath}`)
  }

  /**
   * Update asset metadata (alt text, filename).
   * Stores metadata as a `.meta.yaml` sidecar file alongside the asset.
   * If filename is updated, the asset file is also renamed.
   */
  async updateMetadata(assetPath: string, update: AssetMetadataUpdate): Promise<Asset> {
    const fullPath = this.resolveAssetPath(assetPath)

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
      this.validateFilename(update.filename)
      const dir = path.dirname(assetPath)
      const newRelativePath = dir === '.' ? update.filename : path.join(dir, update.filename)
      const newFullPath = this.resolveAssetPath(newRelativePath)

      if (await this.fsAdapter.exists(newFullPath)) {
        throw new ConflictError(`Asset already exists at "${newRelativePath}"`)
      }

      await this.fsAdapter.moveFile(fullPath, newFullPath)

      // Move old meta file if it existed
      if (metaExists) {
        await this.fsAdapter.deleteFile(metaPath)
      }

      finalAssetPath = newRelativePath

      // Write meta to the new location
      const newMetaPath = `${newFullPath}.meta.yaml`
      await this.writeMetadataAtomic(newMetaPath, merged)
    } else {
      // Write metadata sidecar
      await this.writeMetadataAtomic(metaPath, merged)
    }

    // Build and return the updated asset
    const finalFullPath = this.resolveAssetPath(finalAssetPath)
    const stat = await fs.stat(finalFullPath)
    const asset = this.buildAssetFromStat(finalAssetPath, stat)

    // Attach alt from metadata
    if (merged.alt !== undefined) {
      asset.alt = merged.alt as string
    }

    const renamed = update.filename && update.filename !== path.basename(assetPath)
    this.report(renamed ? 'move' : 'update', renamed ? [fullPath, finalFullPath, ...(metaExists ? [metaPath] : []), `${finalFullPath}.meta.yaml`] : [metaPath], 'asset', finalAssetPath, `Updated asset metadata for ${finalAssetPath}`)

    return asset
  }

  /**
   * Read metadata for an asset from its `.meta.yaml` sidecar file.
   */
  async getMetadata(assetPath: string): Promise<Record<string, unknown>> {
    const fullPath = this.resolveAssetPath(assetPath)
    const metaPath = `${fullPath}.meta.yaml`

    const metaExists = await this.fsAdapter.exists(metaPath)
    if (!metaExists) {
      return {}
    }

    const content = await this.fsAdapter.readFile(metaPath)
    return (parseYaml(content) as Record<string, unknown>) ?? {}
  }

  private async attachMetadata(assetPath: string, asset: Asset): Promise<Asset> {
    const metadata = await this.getMetadata(assetPath)
    return typeof metadata.alt === 'string' ? { ...asset, alt: metadata.alt } : asset
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

  /** Reject absolute, traversal, and platform-specific separator paths. */
  private resolveAssetPath(relativePath: string): string {
    if (typeof relativePath !== 'string' || relativePath.length === 0 || relativePath.includes('\0')) {
      throw new Error('Asset path must be a non-empty relative path')
    }
    if (path.isAbsolute(relativePath) || relativePath.includes('\\')) {
      throw new Error(`Asset path must stay within assets directory: ${relativePath}`)
    }

    const candidate = path.resolve(this.assetsPath, relativePath)
    const relative = path.relative(this.assetsPath, candidate)
    if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`Asset path must stay within assets directory: ${relativePath}`)
    }
    return candidate
  }

  private validateFilename(filename: string): void {
    if (!filename || filename === '.' || filename === '..' || path.basename(filename) !== filename || filename.includes('\\')) {
      throw new Error(`Asset filename must not contain a path: ${filename}`)
    }
  }

  private async writeMetadataAtomic(metaPath: string, metadata: Record<string, unknown>): Promise<void> {
    const result = await this.atomicWriter.writeFileAtomic(metaPath, stringifyYaml(metadata))
    if (!result.success) throw result.error ?? new Error(`Could not write asset metadata: ${metaPath}`)
  }

  private report(action: 'create' | 'update' | 'delete' | 'move', paths: string[], type: string, id: string, message: string): void {
    this.mutations.report({ action, paths, resource: { type, id }, message, source: 'system', timestamp: Date.now() })
  }
}
