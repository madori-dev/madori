import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { exportArchive } from '../archive-exporter.js'
import { importArchive } from '../archive-importer.js'
import { readManifest } from '../manifest.js'
import extractZip from 'extract-zip'

/**
 * Property 7: Export/Import round-trip preserves content
 *
 * For any set of Madori project resources (blueprints, collections, fieldsets, entries),
 * exporting to an archive and then importing that archive into an empty project SHALL
 * produce files identical to the originals, and the archive SHALL contain a manifest
 * listing all resources and the Madori version.
 *
 * Validates: Requirements 3.1, 3.5, 3.8
 */

// --- Generators ---

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'
const SAFE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789-_'

/** Generate a safe filename (no path separators, starts with letter) */
const safeFilenameArb = fc
  .tuple(
    fc.constantFrom(...LETTERS.split('')),
    fc.array(fc.constantFrom(...SAFE_CHARS.split('')), { minLength: 1, maxLength: 12 }),
  )
  .map(([first, rest]) => first + rest.join(''))

/** Generate random YAML-like content */
const yamlContentArb = fc
  .array(
    fc.tuple(safeFilenameArb, fc.oneof(fc.string({ minLength: 1, maxLength: 50 }), fc.integer())),
    { minLength: 1, maxLength: 4 },
  )
  .map((pairs) => pairs.map(([k, v]) => `${k}: ${v}`).join('\n'))

/** Generate random Markdown content */
const markdownContentArb = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 30 }),
    fc.string({ minLength: 0, maxLength: 200 }),
  )
  .map(([title, body]) => `---\ntitle: ${title}\nslug: example\n---\n# ${title}\n\n${body}\n`)

/** A resource file: relative path + content */
interface ResourceFile {
  relativePath: string
  content: string
}

/** Generate a set of resource files across the four resource categories */
const resourceFilesArb = fc
  .record({
    blueprints: fc.array(
      fc.tuple(safeFilenameArb, yamlContentArb).map(([name, content]) => ({
        relativePath: `resources/blueprints/collections/${name}.yaml`,
        content,
      })),
      { minLength: 0, maxLength: 2 },
    ),
    collections: fc.array(
      fc.tuple(safeFilenameArb, yamlContentArb).map(([name, content]) => ({
        relativePath: `resources/collections/${name}.yaml`,
        content,
      })),
      { minLength: 0, maxLength: 2 },
    ),
    fieldsets: fc.array(
      fc.tuple(safeFilenameArb, yamlContentArb).map(([name, content]) => ({
        relativePath: `resources/fieldsets/${name}.yaml`,
        content,
      })),
      { minLength: 0, maxLength: 2 },
    ),
    content: fc.array(
      fc.tuple(safeFilenameArb, safeFilenameArb, markdownContentArb).map(
        ([collection, entry, content]) => ({
          relativePath: `content/collections/${collection}/${entry}.md`,
          content,
        }),
      ),
      { minLength: 0, maxLength: 2 },
    ),
  })
  .filter((res) => {
    // Ensure at least one file exists so the test is meaningful
    const total =
      res.blueprints.length + res.collections.length + res.fieldsets.length + res.content.length
    return total > 0
  })
  // Deduplicate paths within each category
  .map((res) => {
    const dedup = (files: ResourceFile[]): ResourceFile[] => {
      const seen = new Set<string>()
      return files.filter((f) => {
        if (seen.has(f.relativePath)) return false
        seen.add(f.relativePath)
        return true
      })
    }
    return {
      blueprints: dedup(res.blueprints),
      collections: dedup(res.collections),
      fieldsets: dedup(res.fieldsets),
      content: dedup(res.content),
    }
  })

// --- Helpers ---

async function createProjectStructure(
  projectDir: string,
  resources: { blueprints: ResourceFile[]; collections: ResourceFile[]; fieldsets: ResourceFile[]; content: ResourceFile[] },
): Promise<void> {
  // Create the standard directories even if empty
  await fs.mkdir(path.join(projectDir, 'resources/blueprints/collections'), { recursive: true })
  await fs.mkdir(path.join(projectDir, 'resources/collections'), { recursive: true })
  await fs.mkdir(path.join(projectDir, 'resources/fieldsets'), { recursive: true })
  await fs.mkdir(path.join(projectDir, 'content/collections'), { recursive: true })

  const allFiles = [
    ...resources.blueprints,
    ...resources.collections,
    ...resources.fieldsets,
    ...resources.content,
  ]

  for (const file of allFiles) {
    const fullPath = path.join(projectDir, file.relativePath)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, file.content, 'utf-8')
  }
}

async function readAllFiles(
  dir: string,
  basePaths: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  for (const relativePath of basePaths) {
    const fullPath = path.join(dir, relativePath)
    try {
      const content = await fs.readFile(fullPath, 'utf-8')
      result.set(relativePath, content)
    } catch {
      // File doesn't exist
    }
  }
  return result
}

describe('Export/Import Round-Trip — Property Tests', () => {
  let tmpDir: string
  let originalCwd: () => string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-roundtrip-'))
    originalCwd = process.cwd
  })

  afterEach(async () => {
    process.cwd = originalCwd
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('Property 7: Export/Import round-trip preserves content', () => {
    it('exported and re-imported resources produce identical file contents', async () => {
      /**
       * Validates: Requirements 3.1, 3.5, 3.8
       *
       * For any valid set of project resources, exporting to a ZIP archive
       * and importing into an empty project produces files with identical content.
       */
      await fc.assert(
        fc.asyncProperty(resourceFilesArb, async (resources) => {
          // --- Setup source project ---
          const sourceDir = path.join(tmpDir, `source-${Date.now()}-${Math.random().toString(36).slice(2)}`)
          const targetDir = path.join(tmpDir, `target-${Date.now()}-${Math.random().toString(36).slice(2)}`)
          const archivePath = path.join(tmpDir, `archive-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`)

          await fs.mkdir(sourceDir, { recursive: true })
          await fs.mkdir(targetDir, { recursive: true })

          await createProjectStructure(sourceDir, resources)

          // --- Export from source project ---
          process.cwd = () => sourceDir
          const exportResult = await exportArchive({ outputPath: archivePath, format: 'zip' })

          // Verify manifest is present and well-formed
          expect(exportResult.manifest.version).toBeDefined()
          expect(exportResult.manifest.version).toMatch(/^\d+\.\d+\.\d+$/)
          expect(exportResult.manifest.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

          // Verify manifest lists all resources
          const allSourceFiles = [
            ...resources.blueprints,
            ...resources.collections,
            ...resources.fieldsets,
            ...resources.content,
          ]
          const manifestFileCount =
            exportResult.manifest.resources.blueprints.length +
            exportResult.manifest.resources.collections.length +
            exportResult.manifest.resources.fieldsets.length +
            exportResult.manifest.resources.content.length
          expect(manifestFileCount).toBe(allSourceFiles.length)
          expect(exportResult.totalFiles).toBe(allSourceFiles.length)

          // --- Import into target (empty) project ---
          process.cwd = () => targetDir
          const importResult = await importArchive({
            archivePath: exportResult.archivePath,
            conflictResolution: 'accept-import',
          })

          expect(importResult.imported).toBe(allSourceFiles.length)
          expect(importResult.skipped).toBe(0)

          // --- Verify file contents are identical ---
          const sourcePaths = allSourceFiles.map((f) => f.relativePath)
          const sourceContents = await readAllFiles(sourceDir, sourcePaths)
          const targetContents = await readAllFiles(targetDir, sourcePaths)

          for (const [relativePath, sourceContent] of sourceContents) {
            const targetContent = targetContents.get(relativePath)
            expect(targetContent, `File ${relativePath} should exist in target`).toBeDefined()
            expect(targetContent, `File ${relativePath} content mismatch`).toBe(sourceContent)
          }
        }),
        { numRuns: 15 },
      )
    })

    it('archive manifest contains correct resource listings and Madori version', async () => {
      /**
       * Validates: Requirements 3.1, 3.8
       *
       * For any set of resources, the archive's manifest.json correctly lists
       * all included resource paths and includes a valid version string.
       */
      await fc.assert(
        fc.asyncProperty(resourceFilesArb, async (resources) => {
          const sourceDir = path.join(tmpDir, `manifest-src-${Date.now()}-${Math.random().toString(36).slice(2)}`)
          const archivePath = path.join(tmpDir, `manifest-archive-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`)
          const extractDir = path.join(tmpDir, `manifest-extract-${Date.now()}-${Math.random().toString(36).slice(2)}`)

          await fs.mkdir(sourceDir, { recursive: true })
          await fs.mkdir(extractDir, { recursive: true })

          await createProjectStructure(sourceDir, resources)

          // Export
          process.cwd = () => sourceDir
          const exportResult = await exportArchive({ outputPath: archivePath, format: 'zip' })

          // Extract archive to inspect manifest directly
          await extractZip(exportResult.archivePath, { dir: extractDir })

          // Manifest should be at madori-export/manifest.json inside the archive
          const manifestPath = path.join(extractDir, 'madori-export', 'manifest.json')
          const manifest = await readManifest(manifestPath)

          // Verify version is a valid semver-like string
          expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/)

          // Verify all resource paths are listed
          const expectedBlueprints = resources.blueprints.map((f) => f.relativePath)
          const expectedCollections = resources.collections.map((f) => f.relativePath)
          const expectedFieldsets = resources.fieldsets.map((f) => f.relativePath)
          const expectedContent = resources.content.map((f) => f.relativePath)

          expect(manifest.resources.blueprints.sort()).toEqual(expectedBlueprints.sort())
          expect(manifest.resources.collections.sort()).toEqual(expectedCollections.sort())
          expect(manifest.resources.fieldsets.sort()).toEqual(expectedFieldsets.sort())
          expect(manifest.resources.content.sort()).toEqual(expectedContent.sort())

          // Verify exportedAt is a valid ISO timestamp
          const exportDate = new Date(manifest.exportedAt)
          expect(exportDate.getTime()).not.toBeNaN()
        }),
        { numRuns: 15 },
      )
    })
  })
})
