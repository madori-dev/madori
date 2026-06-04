import type { NextRequest } from 'next/server'
import type { StaticCacheConfig } from '@/lib/config/schema'
import type { StaticCacheDriver } from './drivers'
import { isExcluded } from './exclusion'
import { normalizeCacheKey } from './url'
import { replaceCsrfPlaceholder } from './csrf'
import { CacheLock } from './lock'
import { ApplicationCacheDriver } from './drivers/application'
import { FileCacheDriver } from './drivers/file'

/** Module-level singleton for the cache lock */
let cacheLockInstance: CacheLock | null = null

function getCacheLock(): CacheLock {
  if (!cacheLockInstance) {
    cacheLockInstance = new CacheLock()
  }
  return cacheLockInstance
}

/** Module-level singleton for the cache driver */
let driverInstance: StaticCacheDriver | null = null
let driverConfigKey: string | null = null

function getDriver(config: StaticCacheConfig): StaticCacheDriver {
  const configKey = `${config.driver}:${config.storagePath}`
  if (!driverInstance || driverConfigKey !== configKey) {
    if (config.driver === 'file') {
      driverInstance = new FileCacheDriver(config.storagePath)
    } else {
      driverInstance = new ApplicationCacheDriver()
    }
    driverConfigKey = configKey
  }
  return driverInstance
}

/** Generate a fresh CSRF token */
function generateCsrfToken(): string {
  return crypto.randomUUID()
}

/**
 * Handles static cache logic for incoming requests.
 * Returns a cached Response on hit, or null to let Next.js render normally.
 */
export async function handleStaticCache(
  request: NextRequest,
  config: StaticCacheConfig,
  cpPath: string
): Promise<Response | null> {
  if (!config.enabled) return null

  const urlPath = request.nextUrl.pathname + request.nextUrl.search

  if (isExcluded(request.nextUrl.pathname, config.exclude, cpPath)) {
    return null
  }

  const cacheKey = normalizeCacheKey(urlPath, {
    queryStrings: config.queryStrings,
  })

  const driver = getDriver(config)

  // Check cache
  const cached = await driver.get(cacheKey)
  if (cached) {
    const html = replaceCsrfPlaceholder(cached, generateCsrfToken())
    return new Response(html, {
      headers: { 'Content-Type': 'text/html', 'X-Madori-Cache': 'HIT' },
    })
  }

  // Cache miss — acquire lock
  const lock = getCacheLock()
  const lockResult = lock.acquire(cacheKey)

  if (lockResult !== 'acquired') {
    // Wait for another request to finish rendering
    const html = await lockResult
    if (html) {
      return new Response(replaceCsrfPlaceholder(html, generateCsrfToken()), {
        headers: { 'Content-Type': 'text/html', 'X-Madori-Cache': 'HIT' },
      })
    }
    return null // Lock holder failed — render normally
  }

  // We hold the lock — let the request through and cache the response in afterResponse hook
  return null
}

// Export singletons for testing and external access
export { getDriver, getCacheLock, generateCsrfToken }
