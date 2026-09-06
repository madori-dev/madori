import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterAll } from 'vitest'
const cacheDirectory = mkdtempSync(`${tmpdir()}/madori-cache-test-`)
afterAll(() => rmSync(cacheDirectory, { recursive: true, force: true }))
import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { getDriver, handleStaticCache } from '@/lib/static-cache/middleware'
import { InvalidationEngine } from '@/lib/static-cache/invalidation'
import { FileCacheDriver } from '@/lib/static-cache/drivers/file'
import { ApplicationCacheDriver } from '@/lib/static-cache/drivers/application'
import type { StaticCacheConfig } from '@/lib/config/schema'

const config: StaticCacheConfig = {
  enabled: true,
  driver: 'application',
  storagePath: cacheDirectory,
  exclude: [],
  queryStrings: 'ignore',
  warmOnInvalidate: false,
  invalidationRules: [],
}

function request(path: string, init?: RequestInit): NextRequest {
  return new NextRequest(`https://example.test${path}`, {
    headers: { accept: 'text/html', ...(init?.headers ?? {}) },
    ...init,
  })
}

afterEach(async () => getDriver(config).clear())

describe('static cache reliability', () => {
  it('renders one cold request, serves concurrent waiters, and populates cache', async () => {
    let renders = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const render = vi.fn(async () => {
      renders++
      await gate
      return new Response('<html>fresh</html>', { headers: { 'content-type': 'text/html' } })
    })
    const first = handleStaticCache(request('/cold'), config, '/cp', undefined, render)
    const second = handleStaticCache(request('/cold'), config, '/cp', undefined, render)
    await new Promise((resolve) => setTimeout(resolve, 0))
    release()
    const responses = await Promise.all([first, second])

    expect(renders).toBe(1)
    expect(await responses[0]?.text()).toBe('<html>fresh</html>')
    expect(await responses[1]?.text()).toBe('<html>fresh</html>')
    expect(await (await handleStaticCache(request('/cold'), config, '/cp'))?.text()).toBe('<html>fresh</html>')
  })

  it('releases lock after render failure and fails open', async () => {
    const render = vi.fn().mockRejectedValue(new Error('render failed'))
    await expect(handleStaticCache(request('/failure'), config, '/cp', undefined, render)).resolves.toBeNull()
    const retry = vi.fn().mockResolvedValue(new Response('<html>retry</html>', { headers: { 'content-type': 'text/html' } }))
    await expect(handleStaticCache(request('/failure'), config, '/cp', undefined, retry)).resolves.toBeInstanceOf(Response)
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('bypasses cache for cookies and non-HTML requests', async () => {
    const render = vi.fn()
    await expect(handleStaticCache(request('/private', { headers: { cookie: 'session=x' } }), config, '/cp', undefined, render)).resolves.toBeNull()
    await expect(handleStaticCache(new NextRequest('https://example.test/data', { headers: { accept: 'application/json' } }), config, '/cp', undefined, render)).resolves.toBeNull()
    expect(render).not.toHaveBeenCalled()
  })

  it('bypasses authorization and router prefetch requests', async () => {
    const render = vi.fn()
    for (const header of ['authorization', 'next-router-state-tree', 'next-url', 'purpose']) {
      await expect(handleStaticCache(request('/private', { headers: { [header]: header === 'purpose' ? 'prefetch' : '1' } }), config, '/cp', undefined, render)).resolves.toBeNull()
    }
    expect(render).not.toHaveBeenCalled()
  })

  it('does not cache private or personalized responses', async () => {
    const privateResponse = await handleStaticCache(request('/private-response'), config, '/cp', undefined, async () => new Response('<html>private</html>', {
      headers: { 'content-type': 'text/html', 'set-cookie': 'session=x' },
    }))
    expect(privateResponse?.status).toBe(200)
    expect(await getDriver(config).get('/private-response')).toBeNull()
  })

  it('retains CSP and framework Vary headers on cache hits', async () => {
    const render = async () => new Response('<html>safe</html>', { headers: {
      'content-type': 'text/html', 'content-security-policy': "default-src 'self'",
      vary: 'RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Url, Accept-Encoding',
    } })
    await handleStaticCache(request('/headers'), config, '/cp', undefined, render)
    const hit = await handleStaticCache(request('/headers'), config, '/cp')
    expect(hit?.headers.get('x-madori-cache')).toBe('HIT')
    expect(hit?.headers.get('content-security-policy')).toBe("default-src 'self'")
    expect(hit?.headers.get('vary')).toContain('RSC')
  })

  it('bounds unresponsive renderers and permits a later retry', async () => {
    vi.useFakeTimers()
    try {
      const render = vi.fn(() => new Promise<Response>(() => {}))
      const pending = handleStaticCache(request('/timeout'), config, '/cp', undefined, render)
      await vi.waitFor(() => expect(render).toHaveBeenCalled())
      await vi.advanceTimersByTimeAsync(5000)
      await expect(pending).resolves.toBeNull()
      const retry = async () => new Response('retry', { headers: { 'content-type': 'text/html' } })
      const response = await handleStaticCache(request('/timeout'), config, '/cp', undefined, retry)
      expect(await response?.text()).toBe('retry')
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not repopulate stale HTML after cross-runtime invalidation during render', async () => {
    const driver = getDriver(config)
    const render = async () => {
      await new ApplicationCacheDriver(config.storagePath).clear()
      return new Response('old content', { headers: { 'content-type': 'text/html' } })
    }
    await handleStaticCache(request('/stale-render'), config, '/cp', undefined, render)
    expect(await driver.get('/stale-render')).toBeNull()
  })

  it('invalidates file-driver site roots and glob paths', async () => {
    const directory = await fs.mkdtemp(path.join(config.storagePath, 'file-'))
    const driver = new FileCacheDriver(directory)
    const engine = new InvalidationEngine(driver, [{ trigger: 'posts', urls: ['/posts/*'] }], false)
    await driver.set('/_sites/en', 'root')
    await driver.set('/_sites/en/posts/one', 'post')
    await driver.set('/_sites/fr/posts/two', 'post')
    await engine.invalidate({ type: 'entry', url: '/' })
    expect(await driver.get('/_sites/en')).toBeNull()
    await engine.invalidate({ type: 'entry', collection: 'posts' })
    expect(await driver.get('/_sites/en/posts/one')).toBeNull()
    expect(await driver.get('/_sites/fr/posts/two')).toBeNull()
  })

  it('invalidates site-scoped keys in shared driver namespace', async () => {
    const directory = await fs.mkdtemp(path.join(process.cwd(), 'tests/.tmp/static-invalidation-'))
    const driver = new ApplicationCacheDriver(directory)
    await driver.set('/_sites/en/about', '<html>cached</html>')
    const engine = new InvalidationEngine(driver, [], false)
    await engine.invalidate({ type: 'entry', url: '/about' })
    await expect(driver.get('/_sites/en/about')).resolves.toBeNull()
    await fs.rm(directory, { recursive: true, force: true })
  })

  it('invalidates site root keys and observes generation across application drivers', async () => {
    const directory = await fs.mkdtemp(path.join(process.cwd(), 'tests/.tmp/static-generation-'))
    const first = new ApplicationCacheDriver(directory)
    const second = new ApplicationCacheDriver(directory)
    await first.set('/_sites/en', '<html>old</html>')
    await second.set('/_sites/en', '<html>old</html>')
    await expect(second.get('/_sites/en')).resolves.toBe('<html>old</html>')
    const engine = new InvalidationEngine(first, [], false)
    await engine.invalidate({ type: 'global' })
    await expect(second.get('/_sites/en')).resolves.toBeNull()
    await fs.rm(directory, { recursive: true, force: true })
  })
})
