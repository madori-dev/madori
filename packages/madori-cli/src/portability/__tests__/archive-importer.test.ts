import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { ZipArchive } from 'archiver'
import { createWriteStream } from 'fs'
import * as tar from 'tar'
import { importArchive } from '../archive-importer.js'
import { writeManifest } from '../manifest.js'
import type { ExportManifest } from '../manifest.js'

describe('archive-importer', () => {
  let tmpDir: string
  let projectDir: string
  let archiveSourceDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-importer-test-'))
    projectDir = path.join(tmpDir, 'project')
    archiveSourceDir = path.join(tmpDir, 'archive-source')
    await fs.mkdir(projectDir, { recursive: true })
    await fs.mkdir(archiveSourceDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function createTestArchiveContent(manifest: ExportManifest): Promise<void> {
    await writeManifest(path.join(archiveSourceDir, 'manifest.json'), manifest)

    const allFiles = [
      ...manifest.resources.blueprints,
      ...manifest.resources.collections,
      ...manifest.resources.fieldsets,
      ...manifest.resources.content,
    ]

    for (const filePath of allFiles) {
      const fullPath = path.join(archiveSourceDir, filePath)
      await fs.mkdir(path.dirname(fullPath), { recursive: true })
      await fs.writeFile(fullPath, `content of ${filePath}`, 'utf-8')
    }
  }

  async function createZipArchive(sourceDir: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(outputPath)
      const archive = new ZipArchive({ zlib: { level: 9 } })

      output.on('close', resolve)
      archive.on('error', reject)

      archive.pipe(output)
      archive.directory(sourceDir, false)
      archive.finalize()
    })
  }

  async function createTarArchive(sourceDir: string, outputPath: string): Promise<void> {
    await tar.create(
      { file: outputPath, cwd: sourceDir, gzip: true },
      await fs.readdir(sourceDir),
    )
  }

  describe('ZIP import', () => {
    it('imports all files from a ZIP archive with no conflicts', async () => {
      const manifest: ExportManifest = {
        version: '0.1.0',
        exportedAt: '2025-01-15T10:30:00.000Z',
        resources: {
          blueprints: ['resources/blueprints/collections/test-import-blog.yaml'],
          collections: ['resources/collections/test-import-blog.yaml'],
          fieldsets: [],
          content: ['content/collections/test-import-blog/hello.md'],
        },
      }

      await createTestArchiveContent(manifest)
      const archivePath = path.join(tmpDir, 'export.zip')
      await createZipArchive(archiveSourceDir, archivePath)

      const result = await importArchive({
        archivePath,
        conflictResolution: 'accept-import',
      })

      expect(result.totalFiles).toBe(3)
      expect(result.imported).toBe(3)
      expect(result.skipped).toBe(0)
      expect(result.conflicts).toBe(0)

      // Verify files were placed correctly
      const blueprintContent = await fs.readFile(
        path.join(process.cwd(), 'resources/blueprints/collections/test-import-blog.yaml'),
        'utf-8',
      )
      expect(blueprintContent).toBe('content of resources/blueprints/collections/test-import-blog.yaml')

      // Cleanup created files
      await fs.rm(path.join(process.cwd(), 'resources/blueprints/collections/test-import-blog.yaml'))
      await fs.rm(path.join(process.cwd(), 'resources/collections/test-import-blog.yaml'))
      await fs.rm(path.join(process.cwd(), 'content/collections/test-import-blog/hello.md'))
    })

    it('detects conflicts when local files exist and resolves with accept-import', async () => {
      const manifest: ExportManifest = {
        version: '0.1.0',
        exportedAt: '2025-01-15T10:30:00.000Z',
        resources: {
          blueprints: ['resources/blueprints/collections/existing.yaml'],
          collections: [],
          fieldsets: [],
          content: [],
        },
      }

      await createTestArchiveContent(manifest)
      const archivePath = path.join(tmpDir, 'export.zip')
      await createZipArchive(archiveSourceDir, archivePath)

      // Create existing local file
      const localPath = path.join(process.cwd(), 'resources/blueprints/collections/existing.yaml')
      await fs.mkdir(path.dirname(localPath), { recursive: true })
      await fs.writeFile(localPath, 'local content', 'utf-8')

      try {
        const result = await importArchive({
          archivePath,
          conflictResolution: 'accept-import',
        })

        expect(result.totalFiles).toBe(1)
        expect(result.imported).toBe(1)
        expect(result.conflicts).toBe(1)
        expect(result.skipped).toBe(0)

        const content = await fs.readFile(localPath, 'utf-8')
        expect(content).toBe('content of resources/blueprints/collections/existing.yaml')
      } finally {
        await fs.rm(localPath)
      }
    })

    it('skips files when conflict resolution is keep-local', async () => {
      const manifest: ExportManifest = {
        version: '0.1.0',
        exportedAt: '2025-01-15T10:30:00.000Z',
        resources: {
          blueprints: ['resources/blueprints/collections/keep-me.yaml'],
          collections: [],
          fieldsets: [],
          content: [],
        },
      }

      await createTestArchiveContent(manifest)
      const archivePath = path.join(tmpDir, 'export.zip')
      await createZipArchive(archiveSourceDir, archivePath)

      // Create existing local file
      const localPath = path.join(process.cwd(), 'resources/blueprints/collections/keep-me.yaml')
      await fs.mkdir(path.dirname(localPath), { recursive: true })
      await fs.writeFile(localPath, 'original local content', 'utf-8')

      try {
        const result = await importArchive({
          archivePath,
          conflictResolution: 'keep-local',
        })

        expect(result.totalFiles).toBe(1)
        expect(result.imported).toBe(0)
        expect(result.conflicts).toBe(1)
        expect(result.skipped).toBe(1)

        const content = await fs.readFile(localPath, 'utf-8')
        expect(content).toBe('original local content')
      } finally {
        await fs.rm(localPath)
      }
    })

    it('skips files when conflict resolution is skip', async () => {
      const manifest: ExportManifest = {
        version: '0.1.0',
        exportedAt: '2025-01-15T10:30:00.000Z',
        resources: {
          blueprints: ['resources/blueprints/collections/skip-me.yaml'],
          collections: [],
          fieldsets: [],
          content: [],
        },
      }

      await createTestArchiveContent(manifest)
      const archivePath = path.join(tmpDir, 'export.zip')
      await createZipArchive(archiveSourceDir, archivePath)

      // Create existing local file
      const localPath = path.join(process.cwd(), 'resources/blueprints/collections/skip-me.yaml')
      await fs.mkdir(path.dirname(localPath), { recursive: true })
      await fs.writeFile(localPath, 'local skip content', 'utf-8')

      try {
        const result = await importArchive({
          archivePath,
          conflictResolution: 'skip',
        })

        expect(result.totalFiles).toBe(1)
        expect(result.imported).toBe(0)
        expect(result.conflicts).toBe(1)
        expect(result.skipped).toBe(1)
      } finally {
        await fs.rm(localPath)
      }
    })
  })

  describe('TAR.GZ import', () => {
    it('imports all files from a .tar.gz archive', async () => {
      const manifest: ExportManifest = {
        version: '0.1.0',
        exportedAt: '2025-01-15T10:30:00.000Z',
        resources: {
          blueprints: ['resources/blueprints/collections/tar-test.yaml'],
          collections: [],
          fieldsets: [],
          content: ['content/collections/tar-test/entry.md'],
        },
      }

      await createTestArchiveContent(manifest)
      const archivePath = path.join(tmpDir, 'export.tar.gz')
      await createTarArchive(archiveSourceDir, archivePath)

      const result = await importArchive({
        archivePath,
        conflictResolution: 'accept-import',
      })

      expect(result.totalFiles).toBe(2)
      expect(result.imported).toBe(2)
      expect(result.skipped).toBe(0)

      // Cleanup
      await fs.rm(path.join(process.cwd(), 'resources/blueprints/collections/tar-test.yaml'))
      await fs.rm(path.join(process.cwd(), 'content/collections/tar-test/entry.md'))
    })

    it('imports from a .tgz archive', async () => {
      const manifest: ExportManifest = {
        version: '0.1.0',
        exportedAt: '2025-01-15T10:30:00.000Z',
        resources: {
          blueprints: ['resources/blueprints/collections/tgz-test.yaml'],
          collections: [],
          fieldsets: [],
          content: [],
        },
      }

      await createTestArchiveContent(manifest)
      const archivePath = path.join(tmpDir, 'export.tgz')
      await createTarArchive(archiveSourceDir, archivePath)

      const result = await importArchive({
        archivePath,
        conflictResolution: 'accept-import',
      })

      expect(result.totalFiles).toBe(1)
      expect(result.imported).toBe(1)

      // Cleanup
      await fs.rm(path.join(process.cwd(), 'resources/blueprints/collections/tgz-test.yaml'))
    })
  })

  describe('empty archive', () => {
    it('handles an archive with no resource files', async () => {
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

      await createTestArchiveContent(manifest)
      const archivePath = path.join(tmpDir, 'empty.zip')
      await createZipArchive(archiveSourceDir, archivePath)

      const result = await importArchive({
        archivePath,
        conflictResolution: 'accept-import',
      })

      expect(result.totalFiles).toBe(0)
      expect(result.imported).toBe(0)
      expect(result.skipped).toBe(0)
      expect(result.conflicts).toBe(0)
    })
  })

  describe('missing source files', () => {
    it('skips files listed in manifest but missing from archive', async () => {
      const manifest: ExportManifest = {
        version: '0.1.0',
        exportedAt: '2025-01-15T10:30:00.000Z',
        resources: {
          blueprints: ['resources/blueprints/collections/ghost.yaml'],
          collections: [],
          fieldsets: [],
          content: [],
        },
      }

      // Write manifest but don't create the actual file
      await writeManifest(path.join(archiveSourceDir, 'manifest.json'), manifest)
      const archivePath = path.join(tmpDir, 'incomplete.zip')
      await createZipArchive(archiveSourceDir, archivePath)

      const result = await importArchive({
        archivePath,
        conflictResolution: 'accept-import',
      })

      expect(result.totalFiles).toBe(1)
      expect(result.imported).toBe(0)
      expect(result.skipped).toBe(1)
    })
  })

  describe('format detection', () => {
    it('detects .zip format', async () => {
      const manifest: ExportManifest = {
        version: '0.1.0',
        exportedAt: '2025-01-15T10:30:00.000Z',
        resources: {
          blueprints: ['resources/blueprints/collections/detect.yaml'],
          collections: [],
          fieldsets: [],
          content: [],
        },
      }

      await createTestArchiveContent(manifest)

      // Create zip
      const zipPath = path.join(tmpDir, 'test.zip')
      await createZipArchive(archiveSourceDir, zipPath)

      const result = await importArchive({
        archivePath: zipPath,
        conflictResolution: 'accept-import',
      })

      expect(result.imported).toBe(1)

      // Cleanup
      await fs.rm(path.join(process.cwd(), 'resources/blueprints/collections/detect.yaml'))
    })
  })
})
