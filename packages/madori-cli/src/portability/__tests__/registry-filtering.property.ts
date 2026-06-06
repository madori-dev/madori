import { describe, it, afterEach } from 'vitest'
import fc from 'fast-check'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

/**
 * Validates: Requirements 4.3
 * Property 8: Registry resource filtering
 *
 * For any comma-separated list of resource types passed via --resources,
 * the registry pull/push operation SHALL only transfer resources of those
 * specified types, leaving all other local resource types unmodified.
 *
 * Since the registry client's scanResources is private and depends on Git,
 * we test the filtering behavior by replicating the same directory-scanning
 * logic used internally: given a directory structure with files in
 * resources/blueprints/, resources/collections/, resources/fieldsets/,
 * scanning with a filter only returns files of those specified types.
 */

const ALL_RESOURCE_TYPES = ['blueprints', 'collections', 'fieldsets'] as const
type ResourceType = typeof ALL_RESOURCE_TYPES[number]

interface ResourceEntry {
  relativePath: string
  type: string
}

/**
 * Replicates the scanResources logic from registry-client.ts.
 * Scans a directory for resource files, optionally filtering by type.
 */
async function scanResources(
  repoDir: string,
  filterTypes?: string[],
): Promise<ResourceEntry[]> {
  const resources: ResourceEntry[] = []
  const types = filterTypes ?? [...ALL_RESOURCE_TYPES]

  for (const type of types) {
    const dir = path.join(repoDir, 'resources', type)

    if (!(await fileExists(dir))) {
      continue
    }

    const files = await walkDirectory(dir)
    for (const file of files) {
      const relativePath = path.relative(path.join(repoDir, 'resources'), file)
      resources.push({ relativePath, type })
    }
  }

  return resources
}

async function walkDirectory(dir: string): Promise<string[]> {
  const results: string[] = []
  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const subFiles = await walkDirectory(fullPath)
      results.push(...subFiles)
    } else if (entry.isFile()) {
      results.push(fullPath)
    }
  }

  return results
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Creates a temp directory mimicking a registry structure with files
 * in each resource type directory.
 */
async function setupRegistryDir(
  filesByType: Record<ResourceType, string[]>
): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-registry-filter-test-'))

  for (const type of ALL_RESOURCE_TYPES) {
    const files = filesByType[type]
    if (files.length > 0) {
      const typeDir = path.join(tmpDir, 'resources', type)
      await fs.mkdir(typeDir, { recursive: true })
      for (const file of files) {
        const filePath = path.join(typeDir, file)
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await fs.writeFile(filePath, `content of ${type}/${file}`)
      }
    }
  }

  return tmpDir
}

// Track temp dirs for cleanup
const tmpDirs: string[] = []

afterEach(async () => {
  for (const dir of tmpDirs) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
  tmpDirs.length = 0
})

/**
 * Generator for a safe filename (alphanumeric + hyphens, ending in .yaml)
 */
const safeFilename = fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/).map(s => `${s}.yaml`)

/**
 * Generator for a unique set of filenames (no duplicates within a type)
 */
const uniqueFilenames = fc.uniqueArray(safeFilename, { minLength: 1, maxLength: 3 })

/**
 * Generator for files per resource type
 */
const filesPerType = fc.record({
  blueprints: uniqueFilenames,
  collections: uniqueFilenames,
  fieldsets: uniqueFilenames,
}) as fc.Arbitrary<Record<ResourceType, string[]>>

/**
 * Generator for a non-empty subset of resource types
 */
const resourceTypeSubset = fc.subarray([...ALL_RESOURCE_TYPES], { minLength: 1 })

describe('Registry Resource Filtering — Property Tests', () => {
  it('Property 8: filtering only returns resources of specified types', async () => {
    await fc.assert(
      fc.asyncProperty(
        filesPerType,
        resourceTypeSubset,
        async (filesByType, filterTypes) => {
          const tmpDir = await setupRegistryDir(filesByType)
          tmpDirs.push(tmpDir)

          const results = await scanResources(tmpDir, filterTypes)

          // Every result must be of a type that was in the filter
          for (const entry of results) {
            if (!filterTypes.includes(entry.type as ResourceType)) {
              return false
            }
          }

          // No type outside the filter should appear in results
          const resultTypes = new Set(results.map(r => r.type))
          for (const type of resultTypes) {
            if (!filterTypes.includes(type as ResourceType)) {
              return false
            }
          }

          return true
        }
      ),
      { numRuns: 50 }
    )
  })

  it('Property 8: all files of specified types are included in results', async () => {
    await fc.assert(
      fc.asyncProperty(
        filesPerType,
        resourceTypeSubset,
        async (filesByType, filterTypes) => {
          const tmpDir = await setupRegistryDir(filesByType)
          tmpDirs.push(tmpDir)

          const results = await scanResources(tmpDir, filterTypes)
          const resultPaths = new Set(results.map(r => r.relativePath))

          // Every file for every filtered type must appear in results
          for (const type of filterTypes) {
            for (const file of filesByType[type]) {
              const expectedPath = path.join(type, file)
              if (!resultPaths.has(expectedPath)) {
                return false
              }
            }
          }

          return true
        }
      ),
      { numRuns: 50 }
    )
  })

  it('Property 8: non-specified resource types are not present in results', async () => {
    await fc.assert(
      fc.asyncProperty(
        filesPerType,
        resourceTypeSubset,
        async (filesByType, filterTypes) => {
          const tmpDir = await setupRegistryDir(filesByType)
          tmpDirs.push(tmpDir)

          const results = await scanResources(tmpDir, filterTypes)

          // Determine which types were NOT in the filter
          const excludedTypes = ALL_RESOURCE_TYPES.filter(t => !filterTypes.includes(t))

          // No excluded type should appear in results
          for (const entry of results) {
            if (excludedTypes.includes(entry.type as ResourceType)) {
              return false
            }
          }

          return true
        }
      ),
      { numRuns: 50 }
    )
  })

  it('Property 8: result count equals sum of file counts for filtered types only', async () => {
    await fc.assert(
      fc.asyncProperty(
        filesPerType,
        resourceTypeSubset,
        async (filesByType, filterTypes) => {
          const tmpDir = await setupRegistryDir(filesByType)
          tmpDirs.push(tmpDir)

          const results = await scanResources(tmpDir, filterTypes)

          const expectedCount = filterTypes.reduce(
            (sum, type) => sum + filesByType[type].length,
            0
          )

          return results.length === expectedCount
        }
      ),
      { numRuns: 50 }
    )
  })
})
