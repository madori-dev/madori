/**
 * File Watcher
 *
 * Watches content/, resources/, and users/ directories for changes
 * and triggers cache invalidation based on file path patterns.
 */

import { watch, type FSWatcher } from 'chokidar'
import path from 'path'
import type { ContentCache } from './store'

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink'
  path: string
  timestamp: number
}

export interface FileWatcher {
  start(): void
  stop(): void
  onFileChange(callback: (event: FileChangeEvent) => void): void
}

export interface FileWatcherOptions {
  cache: ContentCache
  basePath: string
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

  constructor(options: FileWatcherOptions) {
    this.cache = options.cache
    this.basePath = options.basePath
  }

  start(): void {
    const watchPaths = [
      path.join(this.basePath, 'content'),
      path.join(this.basePath, 'resources'),
      path.join(this.basePath, 'users'),
    ]

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
    } catch (error) {
      console.error('[madori:watcher] Failed to start watcher:', error)
    }
  }

  stop(): void {
    if (this.watcher) {
      try {
        this.watcher.close()
      } catch (error) {
        console.error('[madori:watcher] Error stopping watcher:', error)
      }
      this.watcher = null
    }
  }

  onFileChange(callback: (event: FileChangeEvent) => void): void {
    this.callbacks.push(callback)
  }

  private handleEvent(type: FileChangeEvent['type'], filePath: string): void {
    try {
      const relativePath = path.relative(this.basePath, filePath)

      const event: FileChangeEvent = {
        type,
        path: relativePath,
        timestamp: Date.now(),
      }

      // Invalidate cache by file path
      this.cache.invalidateByFilePath(relativePath)

      // Invalidate pattern-based cache keys
      const patterns = getInvalidationPatterns(relativePath)
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
