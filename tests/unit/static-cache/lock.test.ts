import { describe, it, expect } from 'vitest'
import { CacheLock } from '@/lib/static-cache/lock'

describe('CacheLock', () => {
  it('returns "acquired" for the first request to a URL', () => {
    const lock = new CacheLock()
    const result = lock.acquire('/test')
    expect(result).toBe('acquired')
  })

  it('returns a promise for subsequent requests to the same URL', () => {
    const lock = new CacheLock()
    lock.acquire('/test')
    const result = lock.acquire('/test')
    expect(result).not.toBe('acquired')
    expect(result).toBeInstanceOf(Promise)
  })

  it('release resolves waiting promises with cached HTML', async () => {
    const lock = new CacheLock()
    lock.acquire('/test')

    const waiterResult = lock.acquire('/test')
    expect(waiterResult).toBeInstanceOf(Promise)

    const html = '<html><body>Hello</body></html>'
    lock.release('/test', html)

    const resolved = await (waiterResult as Promise<string | null>)
    expect(resolved).toBe(html)
  })

  it('fail rejects waiting promises with an error', async () => {
    const lock = new CacheLock()
    lock.acquire('/test')

    const waiterResult = lock.acquire('/test')
    expect(waiterResult).toBeInstanceOf(Promise)

    const error = new Error('Render failed')
    lock.fail('/test', error)

    await expect(waiterResult as Promise<string | null>).rejects.toThrow(
      'Render failed',
    )
  })

  it('does not block requests to different URLs', () => {
    const lock = new CacheLock()
    const result1 = lock.acquire('/page-a')
    const result2 = lock.acquire('/page-b')
    expect(result1).toBe('acquired')
    expect(result2).toBe('acquired')
  })

  it('removes the lock entry after release', () => {
    const lock = new CacheLock()
    lock.acquire('/test')
    lock.release('/test', '<html></html>')

    // A new acquire should return 'acquired' again
    const result = lock.acquire('/test')
    expect(result).toBe('acquired')
  })

  it('removes the lock entry after fail', async () => {
    const lock = new CacheLock()
    lock.acquire('/test')

    // Catch the rejection from the first lock's promise
    const firstWaiter = lock.acquire('/test') as Promise<string | null>
    lock.fail('/test', new Error('fail'))
    await firstWaiter.catch(() => {}) // consume the rejection

    // A new acquire should return 'acquired' again
    const result = lock.acquire('/test')
    expect(result).toBe('acquired')
  })

  it('release is a no-op if key does not exist', () => {
    const lock = new CacheLock()
    // Should not throw
    lock.release('/nonexistent', '<html></html>')
  })

  it('fail is a no-op if key does not exist', () => {
    const lock = new CacheLock()
    // Should not throw
    lock.fail('/nonexistent', new Error('fail'))
  })
})
