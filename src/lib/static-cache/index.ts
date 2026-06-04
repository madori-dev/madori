/**
 * Static Cache — Public API
 *
 * Single import point for the Madori static cache subsystem.
 * Provides cache drivers, middleware, invalidation, CLI tooling,
 * and supporting utilities.
 */

// Driver interface and implementations
export type { StaticCacheDriver } from './drivers'
export { ApplicationCacheDriver } from './drivers/application'
export { FileCacheDriver } from './drivers/file'

// Middleware
export { handleStaticCache } from './middleware'

// Invalidation engine
export { InvalidationEngine } from './invalidation'
export type { InvalidationEvent, InvalidationRule } from './invalidation'

// Singleton instance management
export { initInvalidationEngine, getInvalidationEngine } from './instance'
export type { InvalidationEngineConfig } from './instance'

// Cache lock
export { CacheLock } from './lock'

// URL normalization
export { normalizeCacheKey } from './url'
export type { UrlNormalizerOptions } from './url'

// Exclusion matching
export { isExcluded } from './exclusion'

// Glob utilities
export { globToRegex, matchGlob } from './glob'

// CSRF token handling
export { CSRF_PLACEHOLDER, injectCsrfPlaceholder, replaceCsrfPlaceholder } from './csrf'

// NoCache client-side script
export { getNoCacheScript } from './nocache-script'

// CLI tooling
export { warmCache, discoverRoutes } from './cli/warm'
export type { WarmOptions, WarmResult } from './cli/warm'
export { clearCache } from './cli/clear'
