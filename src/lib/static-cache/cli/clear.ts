import type { StaticCacheDriver } from '../drivers'

/**
 * Clear all entries from the static cache.
 * Returns the number of cached pages removed.
 */
export async function clearCache(driver: StaticCacheDriver): Promise<number> {
  return driver.clear()
}
