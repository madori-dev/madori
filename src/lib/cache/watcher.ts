/**
 * File Watcher
 *
 * Watches configured content roots for changes
 * and triggers cache invalidation based on file path patterns.
 */

import { watch, type FSWatcher } from 'chokidar'
import path from 'path'
import type { ContentCache } from './store'

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink'
  /** Stable root-relative path, e.g. `content/collections/blog/post.md`. */
  path: string
  /** Absolute path reported by chokidar. */
  absolutePath: string
  /** Configured root containing this change. */
  root: FileWatcherRootName
  timestamp: number
}

export type FileWatcherRootName = 'content' | 'resources' | 'users' | 'assets' | `git-${number}`

export interface FileWatcherRoot {
  name: FileWatcherRootName
  /** Resolved absolute directory path. */
  path: string
}

export interface FileWatcher {
  start(): Promise<void>
  stop(): Promise<void>
  onFileChange(callback: (event: FileChangeEvent) => void): void
}

export interface FileWatcherOptions {
  cache: ContentCache
  /** @deprecated Prefer `roots` so external configured paths are watched. */
  basePath: string
  /** Resolved configured roots. Defaults to conventional paths under basePath. */
  roots?: readonly FileWatcherRoot[]
}

const TEMPORARY_FILE_SEGMENT = /(^|\/)\.[^/]+$|\.tmp\.[^/]+$|~$/

/** Atomic-write temp files must not invalidate cache or trigger external sync. */
export function isTemporaryFilePath(filePath: string): boolean {
  return TEMPORARY_FILE_SEGMENT.test(filePath.replace(/\\/g, '/'))
}

/**
 * Maps an absolute file path to stable cache namespace without assuming roots
 * live beneath application directory. Returns nothing for untracked paths.
 */
export function getWatchedFilePath(
  filePath: string,
  roots: readonly FileWatcherRoot[]
): Pick<FileChangeEvent, 'absolutePath' | 'path' | 'root'> | undefined {
  const absolutePath = path.resolve(filePath)
  const root = roots
    .map((candidate) => ({ ...candidate, path: path.resolve(candidate.path) }))
    .filter((candidate) => absolutePath === candidate.path || absolutePath.startsWith(`${candidate.path}${path.sep}`))
    .sort((left, right) => right.path.length - left.path.length)[0]

  if (!root) return undefined

  return {
    absolutePath,
    root: root.name,
    path: path.join(root.name, path.relative(root.path, absolutePath)).replace(/\\/g, '/'),
  }
}

/**
 * Maps a relative file path to cache invalidation patterns.
 * Returns an array of pattern strings to invalidate.
 */
export function getInvalidationPatterns(relativePath: string): string[] {
  const normalized = relativePath.replace(/\\/g, '/')
  const patterns: string[] = []

  // content/collections/{collection}/*.md → invalidate entries:{collection}:* and entry:{collection}:*
  const collectionMatch = normalized.match(/^content\/collections\/([^/]+)\//)
  if (collectionMatch) {
    const collection = collectionMatch[1]
    patterns.push(`entries:${collection}:*`)
    patterns.push(`entry:${collection}:*`)
    return patterns
  }

  // content/globals/*.yaml → invalidate global:*
  if (normalized.startsWith('content/globals/')) {
    patterns.push('global:*')
    return patterns
  }

  // content/navigation/*.yaml → invalidate navigation:*
  if (normalized.startsWith('content/navigation/')) {
    patterns.push('navigation:*')
    return patterns
  }

  // content/taxonomies/{taxonomy}/*.yaml → invalidate terms:{taxonomy}:*
  const taxonomyMatch = normalized.match(/^content\/taxonomies\/([^/]+)\//)
  if (taxonomyMatch) {
    const taxonomy = taxonomyMatch[1]
    patterns.push(`terms:${taxonomy}:*`)
    return patterns
  }

  // resources/blueprints/**/*.yaml → invalidate blueprint:*
  if (normalized.startsWith('resources/blueprints/')) {
    patterns.push('blueprint:*')
    return patterns
  }

  return patterns
}

export class ChokidarFileWatcher implements FileWatcher {
  private watcher: FSWatcher | null = null
  private callbacks: Array<(event: FileChangeEvent) => void> = []
  private cache: ContentCache
  private basePath: string
  private roots: FileWatcherRoot[]

  constructor(options: FileWatcherOptions) {
    this.cache = options.cache
    this.basePath = path.resolve(options.basePath)
    this.roots = (options.roots ?? [
      { name: 'content', path: path.join(this.basePath, 'content') },
      { name: 'resources', path: path.join(this.basePath, 'resources') },
      { name: 'users', path: path.join(this.basePath, 'users') },
    ]).map((root) => ({ ...root, path: path.resolve(root.path) }))
  }

  async start(): Promise<void> {
    const watchPaths = this.roots.map((root) => root.path)

    try {
      this.watcher = watch(watchPaths, {
        ignoreInitial: true,
        persistent: true,
      })

      this.watcher.on('add', (filePath) => this.handleEvent('add', filePath))
      this.watcher.on('change', (filePath) => this.handleEvent('change', filePath))
      this.watcher.on('unlink', (filePath) => this.handleEvent('unlink', filePath))

      this.watcher.on('error', (error: unknown) => {
        console.error('[madori:watcher] Error:', error instanceof Error ? error.message : error)
      })

      // Chokidar can classify files created before its initial scan completes
      // as initial entries. Waiting for `ready` closes that startup race.
      await new Promise<void>((resolve) => {
        this.watcher?.once('ready', resolve)
        this.watcher?.once('error', () => resolve())
      })
    } catch (error) {
      console.error('[madori:watcher] Failed to start watcher:', error)
    }
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      const watcher = this.watcher
      this.watcher = null
      try {
        await watcher.close()
      } catch (error) {
        console.error('[madori:watcher] Error stopping watcher:', error)
      }
    }
  }

  onFileChange(callback: (event: FileChangeEvent) => void): void {
    this.callbacks.push(callback)
  }

  private handleEvent(type: FileChangeEvent['type'], filePath: string): void {
    try {
      if (isTemporaryFilePath(filePath)) return
      const watchedPath = getWatchedFilePath(filePath, this.roots)
      if (!watchedPath) return

      const event: FileChangeEvent = {
        type,
        ...watchedPath,
        timestamp: Date.now(),
      }

      // Cache entries may use either semantic root-relative or resolved paths.
      this.cache.invalidateByFilePath(event.path)
      this.cache.invalidateByFilePath(event.absolutePath)

      // Invalidate pattern-based cache keys
      const patterns = getInvalidationPatterns(event.path)
      for (const pattern of patterns) {
        this.cache.invalidatePattern(pattern)
      }

      // Notify registered callbacks
      for (const callback of this.callbacks) {
        try {
          callback(event)
        } catch (error) {
          console.error('[madori:watcher] Error in file change callback:', error)
        }
      }
    } catch (error) {
      console.error('[madori:watcher] Error handling file event:', error)
    }
  }

}
