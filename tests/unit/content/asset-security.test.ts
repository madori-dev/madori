import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { AssetOperations } from '@/lib/content/assets'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { serveAssetFile } from '@/lib/content/asset-serving'
import nextConfig from '../../../next.config'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('asset security', () => {
  it('rejects duplicate bulk sources and destinations before moving anything', async () => {
    const root = await fs.mkdtemp(path.join(process.cwd(), 'tests/.tmp/assets-security-'))
    roots.push(root)
    const operations = new AssetOperations(root, new NodeFileSystemAdapter())
    await fs.writeFile(path.join(root, 'one.txt'), 'one')

    await expect(operations.bulkMove(['one.txt', 'one.txt'], 'dest')).rejects.toThrow('included more than once')
    await expect(operations.bulkMove(['one.txt', 'two.txt'], 'dest')).rejects.toThrow('not found')
    await expect(fs.readFile(path.join(root, 'one.txt'), 'utf8')).resolves.toBe('one')
  })

  it('rejects active HTML and script uploads', async () => {
    const root = await fs.mkdtemp(path.join(process.cwd(), 'tests/.tmp/assets-active-'))
    roots.push(root)
    const operations = new AssetOperations(root, new NodeFileSystemAdapter())

    await expect(operations.uploadAsset({ name: 'payload.html', content: '<script>alert(1)</script>' })).rejects.toThrow(/active/i)
    await expect(operations.uploadAsset({ name: 'payload.js', content: 'alert(1)' })).rejects.toThrow(/active/i)
  })

  it('serves newly written custom-root assets and downloads SVG safely', async () => {
    const root = await fs.mkdtemp(path.join(process.cwd(), 'tests/.tmp/assets-serving-'))
    roots.push(root)
    await fs.writeFile(path.join(root, 'new image.png'), 'png')
    await fs.writeFile(path.join(root, 'vector.svg'), '<svg></svg>')
    await fs.writeFile(path.join(root, 'vector.svg.meta.yaml'), 'alt: private')

    const image = await serveAssetFile(root, 'new image.png')
    expect(image.status).toBe(200)
    expect(image.headers.get('content-type')).toContain('image/png')
    expect(await image.text()).toBe('png')
    const head = await serveAssetFile(root, 'new image.png', true)
    expect(head.status).toBe(200)
    expect(head.headers.get('content-length')).toBe(image.headers.get('content-length'))
    expect(await head.text()).toBe('')

    const svg = await serveAssetFile(root, 'vector.svg')
    expect(svg.headers.get('content-disposition')).toContain('attachment')
    expect(svg.headers.get('content-security-policy')).toBe('sandbox')
    await expect(serveAssetFile(root, 'vector.svg.meta.yaml')).resolves.toMatchObject({ status: 404 })
  })

  it('sanitizes download filenames containing header delimiters', async () => {
    const root = await fs.mkdtemp(path.join(process.cwd(), 'tests/.tmp/assets-headers-'))
    roots.push(root)
    const filename = 'vector\r\nheader.svg'
    await fs.writeFile(path.join(root, filename), '<svg/>')
    const response = await serveAssetFile(root, filename)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="vector__header.svg"')
  })

  it('rewrites asset URLs before public-file lookup', async () => {
    const rewrites = await nextConfig.rewrites?.()
    const beforeFiles = typeof rewrites === 'object' && !Array.isArray(rewrites) ? rewrites.beforeFiles : undefined
    expect(beforeFiles).toContainEqual({ source: '/assets/:path*', destination: '/api/public/assets/:path*' })
  })

  it('rolls back asset and sidecar when delete transaction fails', async () => {
    const root = await fs.mkdtemp(path.join(process.cwd(), 'tests/.tmp/assets-delete-'))
    roots.push(root)
    const baseFs = new NodeFileSystemAdapter()
    await fs.writeFile(path.join(root, 'photo.png'), 'image')
    await fs.writeFile(path.join(root, 'photo.png.meta.yaml'), 'alt: photo\n')
    const failingFs = Object.assign(Object.create(Object.getPrototypeOf(baseFs)), baseFs, {
      deleteFile: async () => { throw new Error('disk unavailable') },
    })
    const operations = new AssetOperations(root, failingFs)

    await expect(operations.deleteAsset('photo.png')).rejects.toThrow('disk unavailable')
    await expect(fs.readFile(path.join(root, 'photo.png'), 'utf8')).resolves.toBe('image')
    await expect(fs.readFile(path.join(root, 'photo.png.meta.yaml'), 'utf8')).resolves.toContain('alt: photo')
  })

  it('rolls back rename when sidecar move fails', async () => {
    const root = await fs.mkdtemp(path.join(process.cwd(), 'tests/.tmp/assets-rename-'))
    roots.push(root)
    const baseFs = new NodeFileSystemAdapter()
    await fs.writeFile(path.join(root, 'old.png'), 'image')
    await fs.writeFile(path.join(root, 'old.png.meta.yaml'), 'alt: old\n')
    const failingFs = Object.assign(Object.create(Object.getPrototypeOf(baseFs)), baseFs, {
      moveFile: async (from: string, to: string) => {
        if (to.endsWith('new.png.meta.yaml')) throw new Error('sidecar unavailable')
        return baseFs.moveFile(from, to)
      },
    })
    const operations = new AssetOperations(root, failingFs)

    await expect(operations.updateMetadata('old.png', { filename: 'new.png' })).rejects.toThrow('sidecar unavailable')
    await expect(fs.readFile(path.join(root, 'old.png'), 'utf8')).resolves.toBe('image')
    await expect(fs.readFile(path.join(root, 'old.png.meta.yaml'), 'utf8')).resolves.toContain('alt: old')
  })
})
