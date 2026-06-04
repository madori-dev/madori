import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import {
  AssetOperations,
  getDisplayMode,
  getFileTypeIcon,
} from '@/lib/content/assets'
import { NotFoundError } from '@/lib/errors'

describe('getDisplayMode', () => {
  it('returns thumbnail for image MIME types', () => {
    expect(getDisplayMode('image/jpeg')).toBe('thumbnail')
    expect(getDisplayMode('image/png')).toBe('thumbnail')
    expect(getDisplayMode('image/gif')).toBe('thumbnail')
    expect(getDisplayMode('image/webp')).toBe('thumbnail')
    expect(getDisplayMode('image/svg+xml')).toBe('thumbnail')
  })

  it('returns icon for non-image MIME types', () => {
    expect(getDisplayMode('application/pdf')).toBe('icon')
    expect(getDisplayMode('video/mp4')).toBe('icon')
    expect(getDisplayMode('audio/mpeg')).toBe('icon')
    expect(getDisplayMode('text/plain')).toBe('icon')
    expect(getDisplayMode('application/zip')).toBe('icon')
  })
})

describe('getFileTypeIcon', () => {
  it('returns file-text for PDFs', () => {
    expect(getFileTypeIcon('application/pdf')).toBe('file-text')
  })

  it('returns archive for zip files', () => {
    expect(getFileTypeIcon('application/zip')).toBe('archive')
  })

  it('returns video for video types', () => {
    expect(getFileTypeIcon('video/mp4')).toBe('video')
    expect(getFileTypeIcon('video/webm')).toBe('video')
  })

  it('returns music for audio types', () => {
    expect(getFileTypeIcon('audio/mpeg')).toBe('music')
    expect(getFileTypeIcon('audio/wav')).toBe('music')
  })

  it('returns file for unknown types', () => {
    expect(getFileTypeIcon('text/plain')).toBe('file')
    expect(getFileTypeIcon('application/json')).toBe('file')
    expect(getFileTypeIcon('image/png')).toBe('file')
  })
})

describe('AssetOperations.updateMetadata', () => {
  let assetOps: AssetOperations
  let adapter: NodeFileSystemAdapter
  let tmpDir: string

  beforeEach(async () => {
    adapter = new NodeFileSystemAdapter()
    tmpDir = path.join(process.cwd(), 'tests', '.tmp', `assets-meta-${Date.now()}`)
    await fs.mkdir(tmpDir, { recursive: true })
    assetOps = new AssetOperations(tmpDir, adapter)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('creates a .meta.yaml sidecar file with alt text', async () => {
    await fs.writeFile(path.join(tmpDir, 'hero.jpg'), 'fake image')

    const asset = await assetOps.updateMetadata('hero.jpg', { alt: 'Hero banner image' })

    expect(asset.alt).toBe('Hero banner image')

    // Verify sidecar file was created
    const metaContent = await fs.readFile(path.join(tmpDir, 'hero.jpg.meta.yaml'), 'utf-8')
    expect(metaContent).toContain('alt: Hero banner image')
  })

  it('merges updates into existing metadata', async () => {
    await fs.writeFile(path.join(tmpDir, 'photo.png'), 'fake png')
    await fs.writeFile(
      path.join(tmpDir, 'photo.png.meta.yaml'),
      'alt: Old alt\ncustom: preserved\n'
    )

    const asset = await assetOps.updateMetadata('photo.png', { alt: 'New alt' })

    expect(asset.alt).toBe('New alt')

    const metaContent = await fs.readFile(path.join(tmpDir, 'photo.png.meta.yaml'), 'utf-8')
    expect(metaContent).toContain('alt: New alt')
    expect(metaContent).toContain('custom: preserved')
  })

  it('renames the asset file when filename is updated', async () => {
    await fs.writeFile(path.join(tmpDir, 'old-name.jpg'), 'fake image')

    const asset = await assetOps.updateMetadata('old-name.jpg', { filename: 'new-name.jpg' })

    expect(asset.path).toBe('new-name.jpg')
    expect(asset.filename).toBe('new-name.jpg')

    // Old file should not exist
    const oldExists = await fs.access(path.join(tmpDir, 'old-name.jpg')).then(() => true).catch(() => false)
    expect(oldExists).toBe(false)

    // New file should exist
    const newExists = await fs.access(path.join(tmpDir, 'new-name.jpg')).then(() => true).catch(() => false)
    expect(newExists).toBe(true)

    // Meta file at new location
    const metaExists = await fs.access(path.join(tmpDir, 'new-name.jpg.meta.yaml')).then(() => true).catch(() => false)
    expect(metaExists).toBe(true)
  })

  it('handles filename update in a subdirectory', async () => {
    const subDir = path.join(tmpDir, 'images')
    await fs.mkdir(subDir, { recursive: true })
    await fs.writeFile(path.join(subDir, 'old.png'), 'png data')

    const asset = await assetOps.updateMetadata('images/old.png', { filename: 'renamed.png' })

    expect(asset.path).toBe('images/renamed.png')
    expect(asset.filename).toBe('renamed.png')
  })

  it('throws NotFoundError for non-existent asset', async () => {
    await expect(
      assetOps.updateMetadata('nonexistent.jpg', { alt: 'test' })
    ).rejects.toThrow(NotFoundError)
  })

  it('updates both alt and filename simultaneously', async () => {
    await fs.writeFile(path.join(tmpDir, 'file.pdf'), 'pdf data')

    const asset = await assetOps.updateMetadata('file.pdf', {
      alt: 'Important document',
      filename: 'important.pdf',
    })

    expect(asset.path).toBe('important.pdf')
    expect(asset.alt).toBe('Important document')
  })
})

describe('AssetOperations.getMetadata', () => {
  let assetOps: AssetOperations
  let adapter: NodeFileSystemAdapter
  let tmpDir: string

  beforeEach(async () => {
    adapter = new NodeFileSystemAdapter()
    tmpDir = path.join(process.cwd(), 'tests', '.tmp', `assets-getmeta-${Date.now()}`)
    await fs.mkdir(tmpDir, { recursive: true })
    assetOps = new AssetOperations(tmpDir, adapter)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('returns empty object when no metadata exists', async () => {
    await fs.writeFile(path.join(tmpDir, 'file.jpg'), 'data')
    const meta = await assetOps.getMetadata('file.jpg')
    expect(meta).toEqual({})
  })

  it('returns metadata from sidecar file', async () => {
    await fs.writeFile(path.join(tmpDir, 'file.jpg'), 'data')
    await fs.writeFile(path.join(tmpDir, 'file.jpg.meta.yaml'), 'alt: My image\n')

    const meta = await assetOps.getMetadata('file.jpg')
    expect(meta).toEqual({ alt: 'My image' })
  })
})
