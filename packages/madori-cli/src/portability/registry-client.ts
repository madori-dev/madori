import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { simpleGit } from 'simple-git'
import { select } from '@inquirer/prompts'
import { resolveProjectPath } from '../utils/resolve-paths.js'

export interface RegistryConfig {
  url: string
  branch?: string
  resources?: string[]
}

export interface PullResult {
  pulled: number
  skipped: number
  conflicts: number
}

export interface PushResult {
  pushed: number
}

type ConflictResolution = 'keep-local' | 'accept-remote' | 'skip'

const RESOURCE_DIRS = ['blueprints', 'collections', 'fieldsets'] as const

/**
 * Pulls resources from a remote Git registry into the local project.
 *
 * 1. Clones the registry with --depth 1 --filter=blob:none
 * 2. Scans for resources (blueprints, collections, fieldsets)
 * 3. Filters by config.resources if specified
 * 4. Compares remote resources with local files
 * 5. Prompts on conflicts (keep local / accept remote / skip)
 * 6. Copies selected resources into local project
 * 7. Cleans up temp directory
 */
export async function registryPull(config: RegistryConfig): Promise<PullResult> {
  const branch = config.branch ?? 'main'
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-registry-pull-'))

  try {
    const git = simpleGit()

    await git.clone(config.url, tmpDir, [
      '--depth', '1',
      '--filter=blob:none',
      '--branch', branch,
    ])

    const remoteResources = await scanResources(tmpDir, config.resources)

    let pulled = 0
    let skipped = 0
    let conflicts = 0

    for (const resource of remoteResources) {
      const localPath = resolveProjectPath('resources', resource.relativePath)
      const remotePath = path.join(tmpDir, 'resources', resource.relativePath)

      const localExists = await fileExists(localPath)

      if (localExists) {
        conflicts++
        const localContent = await fs.readFile(localPath, 'utf-8')
        const remoteContent = await fs.readFile(remotePath, 'utf-8')

        if (localContent === remoteContent) {
          skipped++
          continue
        }

        const resolution = await promptConflictResolution(resource.relativePath)

        if (resolution === 'keep-local' || resolution === 'skip') {
          skipped++
          continue
        }
      }

      await fs.mkdir(path.dirname(localPath), { recursive: true })
      await fs.copyFile(remotePath, localPath)
      pulled++
    }

    return { pulled, skipped, conflicts }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to pull from registry: ${message}`)
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

/**
 * Pushes local resources to a remote Git registry.
 *
 * 1. Clones the registry to a temp directory
 * 2. Copies selected local resources into the clone
 * 3. Commits with a descriptive message
 * 4. Pushes to remote
 * 5. Cleans up temp directory
 */
export async function registryPush(config: RegistryConfig): Promise<PushResult> {
  const branch = config.branch ?? 'main'
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-registry-push-'))

  try {
    const git = simpleGit()

    await git.clone(config.url, tmpDir, [
      '--depth', '1',
      '--branch', branch,
    ])

    const localResources = await scanLocalResources(config.resources)
    let pushed = 0

    for (const resource of localResources) {
      const localPath = resolveProjectPath('resources', resource.relativePath)
      const destPath = path.join(tmpDir, 'resources', resource.relativePath)

      await fs.mkdir(path.dirname(destPath), { recursive: true })
      await fs.copyFile(localPath, destPath)
      pushed++
    }

    if (pushed === 0) {
      return { pushed: 0 }
    }

    const repoGit = simpleGit(tmpDir)
    await repoGit.add('.')
    await repoGit.commit(`Update resources from local project\n\nPushed ${pushed} resource(s)`)
    await repoGit.push('origin', branch)

    return { pushed }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to push to registry: ${message}`)
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

interface ResourceEntry {
  relativePath: string
  type: string
}

/**
 * Scans a cloned registry for resource files, optionally filtering by type.
 */
async function scanResources(
  repoDir: string,
  filterTypes?: string[],
): Promise<ResourceEntry[]> {
  const resources: ResourceEntry[] = []
  const types = filterTypes ?? [...RESOURCE_DIRS]

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

/**
 * Scans local project resources, optionally filtering by type.
 */
async function scanLocalResources(
  filterTypes?: string[],
): Promise<ResourceEntry[]> {
  const resources: ResourceEntry[] = []
  const types = filterTypes ?? [...RESOURCE_DIRS]

  for (const type of types) {
    const dir = resolveProjectPath('resources', type)

    if (!(await fileExists(dir))) {
      continue
    }

    const files = await walkDirectory(dir)
    for (const file of files) {
      const relativePath = path.relative(resolveProjectPath('resources'), file)
      resources.push({ relativePath, type })
    }
  }

  return resources
}

/**
 * Recursively walks a directory and returns all file paths.
 */
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

/**
 * Prompts the user to resolve a conflict between local and remote resources.
 */
async function promptConflictResolution(filePath: string): Promise<ConflictResolution> {
  const answer = await select({
    message: `Conflict: "${filePath}" exists locally and differs from remote. What would you like to do?`,
    choices: [
      { name: 'Keep local', value: 'keep-local' as ConflictResolution },
      { name: 'Accept remote', value: 'accept-remote' as ConflictResolution },
      { name: 'Skip', value: 'skip' as ConflictResolution },
    ],
  })

  return answer
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}
