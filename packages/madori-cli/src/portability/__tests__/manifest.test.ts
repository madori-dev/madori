import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { createManifest, readManifest, writeManifest } from '../manifest.js'
import type { ExportManifest } from '../manifest.js'

describe('manifest', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-manifest-test-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('createManifest', () => {
    it('returns a manifest with version, timestamp, and resources', () => {
      const resources = {
        blueprints: ['resources/blueprints/collections/blog.yaml'],
        collections: ['resources/collections/blog.yaml'],
        fieldsets: [],
        content: ['content/collections/blog/hello.md'],
      }

      const manifest = createManifest(resources)

      expect(manifest.version).toBe('0.1.0')
      expect(manifest.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(manifest.resources).toEqual(resources)
    })

    it('generates a valid ISO timestamp', () => {
      const manifest = createManifest({
        blueprints: [],
        collections: [],
        fieldsets: [],
        content: [],
      })

      const parsed = new Date(manifest.exportedAt)
      expect(parsed.getTime()).not.toBeNaN()
    })
  })

  describe('writeManifest and readManifest', () => {
    it('round-trips a manifest through write and read', async () => {
      const manifest: ExportManifest = {
        version: '0.1.0',
        exportedAt: '2025-01-15T10:30:00.000Z',
        resources: {
          blueprints: ['resources/blueprints/collections/blog.yaml'],
          collections: ['resources/collections/blog.yaml'],
          fieldsets: ['resources/fieldsets/hero.yaml'],
          content: ['content/collections/blog/post-one.md'],
        },
      }

      const filePath = path.join(tmpDir, 'manifest.json')
      await writeManifest(filePath, manifest)
      const result = await readManifest(filePath)

      expect(result).toEqual(manifest)
    })

    it('writes formatted JSON with 2-space indentation', async () => {
      const manifest: ExportManifest = {
        version: '0.1.0',
        exportedAt: '2025-01-15T10:30:00.000Z',
        resources: {
          blueprints: [],
          collections: [],
          fieldsets: [],
          content: [],
        },
      }

      const filePath = path.join(tmpDir, 'manifest.json')
      await writeManifest(filePath, manifest)
      const raw = await fs.readFile(filePath, 'utf-8')

      expect(raw).toBe(JSON.stringify(manifest, null, 2))
    })

    it('creates parent directories if they do not exist', async () => {
      const manifest: ExportManifest = {
        version: '0.1.0',
        exportedAt: '2025-01-15T10:30:00.000Z',
        resources: {
          blueprints: [],
          collections: [],
          fieldsets: [],
          content: [],
        },
      }

      const filePath = path.join(tmpDir, 'nested', 'deep', 'manifest.json')
      await writeManifest(filePath, manifest)
      const result = await readManifest(filePath)

      expect(result).toEqual(manifest)
    })
  })

  describe('readManifest validation', () => {
    it('throws on invalid JSON', async () => {
      const filePath = path.join(tmpDir, 'bad.json')
      await fs.writeFile(filePath, 'not json', 'utf-8')

      await expect(readManifest(filePath)).rejects.toThrow()
    })

    it('throws on missing version field', async () => {
      const filePath = path.join(tmpDir, 'bad.json')
      await fs.writeFile(filePath, JSON.stringify({
        exportedAt: '2025-01-15T10:30:00.000Z',
        resources: { blueprints: [], collections: [], fieldsets: [], content: [] },
      }), 'utf-8')

      await expect(readManifest(filePath)).rejects.toThrow(/Invalid manifest/)
    })

    it('throws on missing resources field', async () => {
      const filePath = path.join(tmpDir, 'bad.json')
      await fs.writeFile(filePath, JSON.stringify({
        version: '0.1.0',
        exportedAt: '2025-01-15T10:30:00.000Z',
      }), 'utf-8')

      await expect(readManifest(filePath)).rejects.toThrow(/Invalid manifest/)
    })

    it('throws when resources arrays contain non-strings', async () => {
      const filePath = path.join(tmpDir, 'bad.json')
      await fs.writeFile(filePath, JSON.stringify({
        version: '0.1.0',
        exportedAt: '2025-01-15T10:30:00.000Z',
        resources: { blueprints: [123], collections: [], fieldsets: [], content: [] },
      }), 'utf-8')

      await expect(readManifest(filePath)).rejects.toThrow(/Invalid manifest/)
    })
  })
})
