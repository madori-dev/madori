import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { AssetOperations, getMimeType } from '@/lib/content/assets'
import { NotFoundError } from '@/lib/errors'

describe('AssetOperations', () => {
  let assetOps: AssetOperations
  let adapter: NodeFileSystemAdapter
  let tmpDir: string

  beforeEach(async () => {
    adapter = new NodeFileSystemAdapter()
    tmpDir = path.join(process.cwd(), 'tests', '.tmp', `assets-${Date.now()}`)
    await fs.mkdir(tmpDir, { recursive: true })
    assetOps = new AssetOperations(tmpDir, adapter)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('getAsset', () => {
    it('returns asset metadata for an existing file', async () => {
      const filePath = path.join(tmpDir, 'image.png')
      await fs.writeFile(filePath, 'fake png content')

      const asset = await assetOps.getAsset('image.png')

      expect(asset).not.toBeNull()
      expect(asset!.path).toBe('image.png')
      expect(asset!.filename).toBe('image.png')
      expect(asset!.extension).toBe('png')
      expect(asset!.mimeType).toBe('image/png')
      expect(asset!.size).toBeGreaterThan(0)
      expect(asset!.modifiedAt).toBeDefined()
    })

    it('returns null for a non-existent file', async () => {
      const asset = await assetOps.getAsset('nonexistent.jpg')
      expect(asset).toBeNull()
    })

    it('returns null for a directory path', async () => {
      const dirPath = path.join(tmpDir, 'subdir')
      await fs.mkdir(dirPath, { recursive: true })

      const asset = await assetOps.getAsset('subdir')
      expect(asset).toBeNull()
    })

    it('handles nested file paths', async () => {
      const nestedDir = path.join(tmpDir, 'images', 'photos')
      await fs.mkdir(nestedDir, { recursive: true })
      await fs.writeFile(path.join(nestedDir, 'photo.jpg'), 'jpeg data')

      const asset = await assetOps.getAsset('images/photos/photo.jpg')

      expect(asset).not.toBeNull()
      expect(asset!.path).toBe('images/photos/photo.jpg')
      expect(asset!.filename).toBe('photo.jpg')
      expect(asset!.extension).toBe('jpg')
      expect(asset!.mimeType).toBe('image/jpeg')
    })
  })

  describe('listAssets', () => {
    it('lists all files in the root assets directory', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.png'), 'png')
      await fs.writeFile(path.join(tmpDir, 'b.jpg'), 'jpg')

      const assets = await assetOps.listAssets()

      expect(assets).toHaveLength(2)
      const filenames = assets.map((a) => a.filename)
      expect(filenames).toContain('a.png')
      expect(filenames).toContain('b.jpg')
    })

    it('lists files in a subdirectory', async () => {
      const subDir = path.join(tmpDir, 'images')
      await fs.mkdir(subDir, { recursive: true })
      await fs.writeFile(path.join(subDir, 'hero.webp'), 'webp data')
      await fs.writeFile(path.join(subDir, 'logo.svg'), 'svg data')

      const assets = await assetOps.listAssets('images')

      expect(assets).toHaveLength(2)
      const paths = assets.map((a) => a.path)
      expect(paths).toContain('images/hero.webp')
      expect(paths).toContain('images/logo.svg')
    })

    it('returns empty array for non-existent directory', async () => {
      const assets = await assetOps.listAssets('nonexistent')
      expect(assets).toEqual([])
    })

    it('returns empty array for empty directory', async () => {
      const emptyDir = path.join(tmpDir, 'empty')
      await fs.mkdir(emptyDir, { recursive: true })

      const assets = await assetOps.listAssets('empty')
      expect(assets).toEqual([])
    })
  })

  describe('uploadAsset', () => {
    it('uploads a file with string content', async () => {
      const asset = await assetOps.uploadAsset({
        name: 'readme.txt',
        content: 'Hello, world!',
      })

      expect(asset.path).toBe('readme.txt')
      expect(asset.filename).toBe('readme.txt')
      expect(asset.extension).toBe('txt')
      expect(asset.mimeType).toBe('text/plain')
      expect(asset.size).toBeGreaterThan(0)

      // Verify file was actually written
      const content = await fs.readFile(path.join(tmpDir, 'readme.txt'), 'utf-8')
      expect(content).toBe('Hello, world!')
    })

    it('uploads a file with Buffer content', async () => {
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]) // PNG magic bytes

      const asset = await assetOps.uploadAsset({
        name: 'image.png',
        content: buffer,
      })

      expect(asset.path).toBe('image.png')
      expect(asset.filename).toBe('image.png')
      expect(asset.extension).toBe('png')
      expect(asset.size).toBe(4)

      // Verify binary content
      const written = await fs.readFile(path.join(tmpDir, 'image.png'))
      expect(written).toEqual(buffer)
    })

    it('uploads to a subdirectory', async () => {
      const asset = await assetOps.uploadAsset(
        { name: 'doc.pdf', content: 'pdf content' },
        'documents'
      )

      expect(asset.path).toBe('documents/doc.pdf')
      expect(asset.filename).toBe('doc.pdf')
      expect(asset.extension).toBe('pdf')
      expect(asset.mimeType).toBe('application/pdf')

      // Verify directory was created
      const exists = await fs.access(path.join(tmpDir, 'documents')).then(() => true).catch(() => false)
      expect(exists).toBe(true)
    })

    it('overwrites existing file on re-upload', async () => {
      await assetOps.uploadAsset({ name: 'file.txt', content: 'original' })
      await assetOps.uploadAsset({ name: 'file.txt', content: 'updated' })

      const content = await fs.readFile(path.join(tmpDir, 'file.txt'), 'utf-8')
      expect(content).toBe('updated')
    })
  })

  describe('deleteAsset', () => {
    it('deletes an existing asset', async () => {
      const filePath = path.join(tmpDir, 'to-delete.png')
      await fs.writeFile(filePath, 'delete me')

      await assetOps.deleteAsset('to-delete.png')

      const exists = await fs.access(filePath).then(() => true).catch(() => false)
      expect(exists).toBe(false)
    })

    it('throws NotFoundError for non-existent asset', async () => {
      await expect(assetOps.deleteAsset('nonexistent.jpg')).rejects.toThrow(NotFoundError)
    })

    it('deletes a nested asset', async () => {
      const nestedDir = path.join(tmpDir, 'images')
      await fs.mkdir(nestedDir, { recursive: true })
      await fs.writeFile(path.join(nestedDir, 'photo.jpg'), 'photo data')

      await assetOps.deleteAsset('images/photo.jpg')

      const exists = await fs.access(path.join(nestedDir, 'photo.jpg')).then(() => true).catch(() => false)
      expect(exists).toBe(false)
    })
  })
})

describe('getMimeType', () => {
  it('returns correct MIME type for common image extensions', () => {
    expect(getMimeType('jpg')).toBe('image/jpeg')
    expect(getMimeType('jpeg')).toBe('image/jpeg')
    expect(getMimeType('png')).toBe('image/png')
    expect(getMimeType('gif')).toBe('image/gif')
    expect(getMimeType('svg')).toBe('image/svg+xml')
    expect(getMimeType('webp')).toBe('image/webp')
  })

  it('returns correct MIME type for document extensions', () => {
    expect(getMimeType('pdf')).toBe('application/pdf')
    expect(getMimeType('json')).toBe('application/json')
  })

  it('is case-insensitive', () => {
    expect(getMimeType('PNG')).toBe('image/png')
    expect(getMimeType('JPG')).toBe('image/jpeg')
    expect(getMimeType('Svg')).toBe('image/svg+xml')
  })

  it('returns application/octet-stream for unknown extensions', () => {
    expect(getMimeType('xyz')).toBe('application/octet-stream')
    expect(getMimeType('unknown')).toBe('application/octet-stream')
  })
})
