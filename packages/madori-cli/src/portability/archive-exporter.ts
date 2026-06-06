import * as fs from 'fs/promises'
import type { Dirent } from 'fs'
import * as path from 'path'
import { createWriteStream } from 'fs'
import { ZipArchive, TarArchive } from 'archiver'
import { createManifest } from './manifest.js'
import type { ExportManifest } from './manifest.js'
import { resolveProjectPath } from '../utils/resolve-paths.js'

export interface ExportOptions {
  outputPath: string
  format: 'zip' | 'tar'
  resources?: string[] // filter by type: 'blueprints', 'collections', 'fieldsets', 'content'
}

export interface ExportResult {
  archivePath: string
  manifest: ExportManifest
  totalFiles: number
}

const RESOURCE_DIRS: Record<string, string> = {
  blueprints: 'resources/blueprints',
  collections: 'resources/collections',
  fieldsets: 'resources/fieldsets',
  content: 'content/collections',
}

/**
 * Scans a directory recursively and returns relative file paths.
 */
async function scanDirectory(baseDir: string, dir: string): Promise<string[]> {
  const files: string[] = []

  let entries: Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true }) as unknown as Dirent[]
  } catch {
    return files
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, String(entry.name))
    if (entry.isDirectory()) {
      const nested = await scanDirectory(baseDir, fullPath)
      files.push(...nested)
    } else if (entry.isFile()) {
      const relativePath = path.relative(baseDir, fullPath)
      files.push(relativePath)
    }
  }

  return files
}

/**
 * Resolves which resource types to include based on options.
 * Returns a filtered subset of RESOURCE_DIRS keys.
 */
function resolveResourceTypes(resources?: string[]): string[] {
  const allTypes = Object.keys(RESOURCE_DIRS)

  if (!resources || resources.length === 0) {
    return allTypes
  }

  return resources.filter((r) => allTypes.includes(r))
}

/**
 * Scans project directories for matching files and groups them by resource type.
 */
async function collectFiles(
  resourceTypes: string[]
): Promise<ExportManifest['resources']> {
  const result: ExportManifest['resources'] = {
    blueprints: [],
    collections: [],
    fieldsets: [],
    content: [],
  }

  for (const type of resourceTypes) {
    const dirRelative = RESOURCE_DIRS[type]
    if (!dirRelative) continue

    const dirAbsolute = resolveProjectPath(dirRelative)
    const files = await scanDirectory(dirAbsolute, dirAbsolute)

    const prefixedFiles = files.map((f) => path.join(dirRelative, f).replace(/\\/g, '/'))
    result[type as keyof ExportManifest['resources']] = prefixedFiles
  }

  return result
}

/**
 * Exports project resources as a ZIP or TAR.GZ archive.
 */
export async function exportArchive(options: ExportOptions): Promise<ExportResult> {
  const { outputPath, format, resources } = options

  // 1. Resolve which resources to include
  const resourceTypes = resolveResourceTypes(resources)

  // 2. Scan project directories for matching files
  const collectedResources = await collectFiles(resourceTypes)

  // 3. Build manifest
  const manifest = createManifest(collectedResources)

  // 4. Determine archive file extension and path
  const extension = format === 'tar' ? '.tar.gz' : '.zip'
  const archivePath = outputPath.endsWith(extension)
    ? outputPath
    : outputPath + extension

  // 5. Ensure output directory exists
  const outputDir = path.dirname(archivePath)
  await fs.mkdir(outputDir, { recursive: true })

  // 6. Create the archive
  const archive = format === 'tar'
    ? new TarArchive({ gzip: true })
    : new ZipArchive({ zlib: { level: 9 } })

  const output = createWriteStream(archivePath)

  const archiveFinished = new Promise<void>((resolve, reject) => {
    output.on('close', resolve)
    archive.on('error', reject)
  })

  archive.pipe(output)

  // Add manifest.json to archive root
  const manifestJson = JSON.stringify(manifest, null, 2)
  archive.append(manifestJson, { name: 'madori-export/manifest.json' })

  // Add all collected resource files
  const projectRoot = resolveProjectPath()
  let totalFiles = 0

  for (const type of resourceTypes) {
    const files = collectedResources[type as keyof ExportManifest['resources']]
    for (const relativePath of files) {
      const absolutePath = path.join(projectRoot, relativePath)
      archive.file(absolutePath, { name: `madori-export/${relativePath}` })
      totalFiles++
    }
  }

  await archive.finalize()
  await archiveFinished

  return {
    archivePath,
    manifest,
    totalFiles,
  }
}
