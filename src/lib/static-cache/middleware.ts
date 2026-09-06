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
const CACHE_TIMEOUT_MS = 5000

export type StaticCacheRender = (signal: AbortSignal) => Promise<Response | null>

function getDriver(config: StaticCacheConfig): StaticCacheDriver {
  const configKey = `${config.driver}:${config.storagePath}`
  if (!driverInstance || driverConfigKey !== configKey) {
    if (config.driver === 'file') {
      driverInstance = new FileCacheDriver(config.storagePath)
    } else {
      driverInstance = new ApplicationCacheDriver(config.storagePath)
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
  cpPath: string,
  scope?: string,
  render?: StaticCacheRender,
): Promise<Response | null> {
  if (!config.enabled) return null
  if (request.method !== 'GET' && request.method !== 'HEAD') return null
  if (
    request.headers.get('cookie')
    || request.headers.get('authorization')
    || request.headers.get('rsc')
    || request.headers.get('next-router-prefetch')
    || request.headers.get('next-router-segment-prefetch')
    || request.headers.get('sec-purpose')?.includes('prefetch')
    || request.headers.get('next-router-state-tree')
    || request.headers.get('next-url')
    || request.headers.get('purpose') === 'prefetch'
    || request.headers.get('x-purpose') === 'prefetch'
  ) return null
  const accept = request.headers.get('accept')
  if (accept && accept !== '*/*' && !accept.includes('text/html')) return null

  const urlPath = request.nextUrl.pathname + request.nextUrl.search

  if (isExcluded(request.nextUrl.pathname, config.exclude, cpPath)) {
    return null
  }

  const normalizedKey = normalizeCacheKey(urlPath, {
    queryStrings: config.queryStrings,
  })
  const safeScope = scope && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(scope) ? scope : null
  const cacheKey = safeScope
    ? `/_sites/${safeScope}${normalizedKey === '/' ? '' : normalizedKey}`
    : normalizedKey

  const driver = getDriver(config)
  return bounded(async (signal) => {
    const generation = await driver.getGeneration?.() ?? ''
    const cached = await driver.get(cacheKey)
    if (cached) {
      const hit = cachedResponse(cached, await driver.getGeneration?.() ?? '', request.method === 'HEAD')
      if (hit) return hit
    }
    // Without a renderer there is no owner capable of releasing a cold lock.
    if (!render || request.method === 'HEAD' || signal.aborted) return null

    const lock = getCacheLock()
    const lockKey = `${config.driver}:${config.storagePath}:${cacheKey}`
    const acquired = lock.acquire(lockKey)
    if (acquired !== 'acquired') {
      const value = await acquired
      return value ? cachedResponse(value, await driver.getGeneration?.() ?? '', false) : null
    }

    let published: string | null = null
    // Release promptly on timeout even when a renderer ignores cancellation.
    const release = () => lock.release(lockKey, published)
    signal.addEventListener('abort', release, { once: true })
    try {
      const response = await render(signal)
      if (!response || response.status !== 200 || !isCacheableResponse(response) || signal.aborted) return response
      const html = await response.clone().text()
      if (signal.aborted || generation !== (await driver.getGeneration?.() ?? '')) return response
      const headers = new Headers(response.headers)
      // Fetch returns decompressed HTML; cached bytes have a fresh length/token.
      for (const header of ['content-length', 'content-encoding', 'transfer-encoding', 'connection', 'age']) headers.delete(header)
      const encoded = ENVELOPE_PREFIX + JSON.stringify({ html, headers: [...headers], generation })
      await driver.set(cacheKey, encoded)
      // Entries carry their original generation, so a delayed write after
      // invalidation cannot resurrect stale content in a different runtime.
      if (!signal.aborted && generation === (await driver.getGeneration?.() ?? '')) published = encoded
      return response
    } finally {
      signal.removeEventListener('abort', release)
      if (!signal.aborted) release()
    }
  })
}

const ENVELOPE_PREFIX = 'MADORI_STATIC_CACHE_V1\n'

function cachedResponse(value: string, generation: string, head: boolean): Response | null {
  let html = value
  let headers = new Headers({ 'Content-Type': 'text/html' })
  if (value.startsWith(ENVELOPE_PREFIX)) {
    try {
      const cached = JSON.parse(value.slice(ENVELOPE_PREFIX.length)) as { html: string; headers: [string, string][]; generation: string }
      if (cached.generation !== generation || typeof cached.html !== 'string') return null
      html = cached.html
      headers = new Headers(cached.headers)
    } catch {
      return null
    }
  }
  headers.set('X-Madori-Cache', 'HIT')
  return new Response(head ? null : replaceCsrfPlaceholder(html, generateCsrfToken()), { headers })
}

/** Bound cache I/O, renderer, body consumption and waiters; cache failures pass through. */
async function bounded<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => { controller.abort(); resolve(null) }, CACHE_TIMEOUT_MS)
      }),
    ])
  } catch {
    controller.abort()
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function isCacheableResponse(response: Response): boolean {
  if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('text/html')) return false
  if (response.headers.has('set-cookie')) return false
  // These variants are excluded on incoming requests. Other Vary values need
  // their own cache key and must pass through until explicitly supported.
  const supportedVary = new Set(['rsc', 'next-router-state-tree', 'next-router-prefetch', 'next-router-segment-prefetch', 'next-url', 'accept-encoding'])
  const vary = (response.headers.get('vary') ?? '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean)
  if (vary.some(value => !supportedVary.has(value))) return false
  return !/(?:^|,)\s*(?:private|no-store|no-cache)(?:[=,]|$)/i.test(response.headers.get('cache-control') ?? '')
}

export { getDriver, getCacheLock, generateCsrfToken }
