import { InvalidationEngine } from './invalidation'
import type { StaticCacheDriver } from './drivers'
import type { InvalidationRule } from './invalidation'
import { ApplicationCacheDriver } from './drivers/application'
import { FileCacheDriver } from './drivers/file'

/**
 * Module-level singleton for the InvalidationEngine.
 * Initialized once via `initInvalidationEngine()` during service startup,
 * then accessible via `getInvalidationEngine()` from CP handlers.
 */
let invalidationEngineInstance: InvalidationEngine | null = null

export interface InvalidationEngineConfig {
  enabled: boolean
  driver: 'application' | 'file'
  storagePath: string
  warmOnInvalidate: boolean
  invalidationRules: InvalidationRule[]
}

/**
 * Initialize the shared InvalidationEngine singleton.
 * Called once during service initialization in the API route setup.
 */
export function initInvalidationEngine(
  config: InvalidationEngineConfig,
  reRenderFn?: (url: string) => Promise<void>
): InvalidationEngine {
  if (!config.enabled) {
    // Create a no-op engine when caching is disabled
    const noopDriver: StaticCacheDriver = {
      async get() { return null },
      async set() {},
      async delete() {},
      async deletePattern() { return [] },
      async clear() { return 0 },
      async has() { return false },
    }
    invalidationEngineInstance = new InvalidationEngine(noopDriver, [], false)
    return invalidationEngineInstance
  }

  let driver: StaticCacheDriver
  if (config.driver === 'file') {
    driver = new FileCacheDriver(config.storagePath)
  } else {
    driver = new ApplicationCacheDriver()
  }

  invalidationEngineInstance = new InvalidationEngine(
    driver,
    config.invalidationRules,
    config.warmOnInvalidate,
    reRenderFn
  )

  return invalidationEngineInstance
}

/**
 * Get the shared InvalidationEngine instance.
 * Returns null if not yet initialized or caching is disabled.
 */
export function getInvalidationEngine(): InvalidationEngine | null {
  return invalidationEngineInstance
}

/** @internal Exposed for testing */
export function _resetInvalidationEngine(): void {
  invalidationEngineInstance = null
}
