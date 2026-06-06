import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { exportArchive } from '../archive-exporter.js'
import type { ExportOptions } from '../archive-exporter.js'
import { readManifest } from '../manifest.js'

/**
 * These tests create a temporary project structure, override process.cwd()
 * to point at it, then exercise the exporter against that structure.
 */
describe('archive-exporter', () => {
  let tmpDir: string
  let originalCwd: () => string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-export-test-'))

    // Create a mock project structure
    await fs.mkdir(path.join(tmpDir, 'resources/blueprints/collections'), { recursive: true })
    await fs.mkdir(path.join(tmpDir, 'resources/collections'), { recursive: true })
    await fs.mkdir(path.join(tmpDir, 'resources/fieldsets'), { recursive: true })
    await fs.mkdir(path.join(tmpDir, 'content/collections/blog'), { recursive: true })

    await fs.writeFile(
      path.join(tmpDir, 'resources/blueprints/collections/blog.yaml'),
      'tabs:\n  main:\n    label: Main\n',
    )
    await fs.writeFile(
      path.join(tmpDir, 'resources/collections/blog.yaml'),
      'title: Blog\nblueprint: blog\n',
    )
    await fs.writeFile(
      path.join(tmpDir, 'resources/fieldsets/hero.yaml'),
      'fields:\n  - handle: title\n',
    )
    await fs.writeFile(
      path.join(tmpDir, 'content/collections/blog/hello.md'),
      '---\ntitle: Hello\n---\n# Hello\n',
    )
    await fs.writeFile(
      path.join(tmpDir, 'content/collections/blog/world.md'),
      '---\ntitle: World\n---\n# World\n',
    )

    // Override process.cwd so resolveProjectPath uses our temp dir
    originalCwd = process.cwd
    process.cwd = () => tmpDir
  })

  afterEach(async () => {
    process.cwd = originalCwd
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('exportArchive', () => {
    it('creates a zip archive with all resources by default', async () => {
      const outputPath = path.join(tmpDir, 'output', 'export')
      const options: ExportOptions = { outputPath, format: 'zip' }

      const result = await exportArchive(options)

      expect(result.archivePath).toBe(outputPath + '.zip')
      expect(result.totalFiles).toBe(5)
      expect(result.manifest.version).toBe('0.1.0')
      expect(result.manifest.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

      // Verify archive file exists
      const stat = await fs.stat(result.archivePath)
      expect(stat.size).toBeGreaterThan(0)
    })

    it('creates a tar.gz archive when format is tar', async () => {
      const outputPath = path.join(tmpDir, 'output', 'export')
      const options: ExportOptions = { outputPath, format: 'tar' }

      const result = await exportArchive(options)

      expect(result.archivePath).toBe(outputPath + '.tar.gz')
      expect(result.totalFiles).toBe(5)

      const stat = await fs.stat(result.archivePath)
      expect(stat.size).toBeGreaterThan(0)
    })

    it('does not double-append extension if already present', async () => {
      const outputPath = path.join(tmpDir, 'output', 'export.zip')
      const options: ExportOptions = { outputPath, format: 'zip' }

      const result = await exportArchive(options)

      expect(result.archivePath).toBe(outputPath)
    })

    it('filters resources by type when resources option is provided', async () => {
      const outputPath = path.join(tmpDir, 'output', 'export')
      const options: ExportOptions = {
        outputPath,
        format: 'zip',
        resources: ['blueprints', 'collections'],
      }

      const result = await exportArchive(options)

      expect(result.totalFiles).toBe(2)
      expect(result.manifest.resources.blueprints).toHaveLength(1)
      expect(result.manifest.resources.collections).toHaveLength(1)
      expect(result.manifest.resources.fieldsets).toHaveLength(0)
      expect(result.manifest.resources.content).toHaveLength(0)
    })

    it('includes only content when filtered to content', async () => {
      const outputPath = path.join(tmpDir, 'output', 'export')
      const options: ExportOptions = {
        outputPath,
        format: 'zip',
        resources: ['content'],
      }

      const result = await exportArchive(options)

      expect(result.totalFiles).toBe(2)
      expect(result.manifest.resources.content).toEqual([
        'content/collections/blog/hello.md',
        'content/collections/blog/world.md',
      ])
      expect(result.manifest.resources.blueprints).toHaveLength(0)
      expect(result.manifest.resources.collections).toHaveLength(0)
      expect(result.manifest.resources.fieldsets).toHaveLength(0)
    })

    it('ignores invalid resource type filters', async () => {
      const outputPath = path.join(tmpDir, 'output', 'export')
      const options: ExportOptions = {
        outputPath,
        format: 'zip',
        resources: ['invalid-type', 'blueprints'],
      }

      const result = await exportArchive(options)

      // Only blueprints matched, invalid type is ignored
      expect(result.totalFiles).toBe(1)
      expect(result.manifest.resources.blueprints).toHaveLength(1)
    })

    it('produces an empty archive when no files match', async () => {
      const outputPath = path.join(tmpDir, 'output', 'export')
      // Use a filter for a type that has no files in our mock structure
      const options: ExportOptions = {
        outputPath,
        format: 'zip',
        resources: ['fieldsets'],
      }

      // Remove the fieldset file
      await fs.rm(path.join(tmpDir, 'resources/fieldsets/hero.yaml'))

      const result = await exportArchive(options)

      expect(result.totalFiles).toBe(0)
      expect(result.manifest.resources.fieldsets).toHaveLength(0)
    })

    it('handles missing directories gracefully', async () => {
      // Remove the fieldsets directory entirely
      await fs.rm(path.join(tmpDir, 'resources/fieldsets'), { recursive: true })

      const outputPath = path.join(tmpDir, 'output', 'export')
      const options: ExportOptions = { outputPath, format: 'zip' }

      const result = await exportArchive(options)

      // Should still succeed with the remaining resources
      expect(result.totalFiles).toBe(4)
      expect(result.manifest.resources.fieldsets).toHaveLength(0)
    })

    it('manifest contains correct resource paths with forward slashes', async () => {
      const outputPath = path.join(tmpDir, 'output', 'export')
      const options: ExportOptions = { outputPath, format: 'zip' }

      const result = await exportArchive(options)

      // All paths should use forward slashes regardless of OS
      for (const files of Object.values(result.manifest.resources)) {
        for (const file of files) {
          expect(file).not.toContain('\\')
        }
      }
    })

    it('manifest includes ISO 8601 timestamp', async () => {
      const outputPath = path.join(tmpDir, 'output', 'export')
      const options: ExportOptions = { outputPath, format: 'zip' }

      const result = await exportArchive(options)

      const date = new Date(result.manifest.exportedAt)
      expect(date.getTime()).not.toBeNaN()
      expect(result.manifest.exportedAt).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })
  })
})
