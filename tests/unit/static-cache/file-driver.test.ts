import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FileCacheDriver } from '@/lib/static-cache/drivers/file'

describe('FileCacheDriver query-key encoding', () => {
  let storagePath: string | undefined

  afterEach(async () => {
    if (storagePath) await fs.rm(storagePath, { recursive: true, force: true })
    storagePath = undefined
  })

  async function createDriver(): Promise<FileCacheDriver> {
    storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-file-cache-'))
    return new FileCacheDriver(storagePath)
  }

  it('keeps separated query variants distinct and round-trippable', async () => {
    const driver = await createDriver()

    await driver.set('/products?filter=a%2Fb&sort=title', 'one')
    await driver.set('/products?filter=caf%C3%A9', 'two')

    await expect(driver.get('/products?filter=a%2Fb&sort=title')).resolves.toBe('one')
    await expect(driver.get('/products?filter=caf%C3%A9')).resolves.toBe('two')
    await expect(driver.get('/products')).resolves.toBeNull()
  })

  it('deletes query variants through glob invalidation without deleting other paths', async () => {
    const driver = await createDriver()

    await driver.set('/products/item?sort=title', 'query')
    await driver.set('/products/item', 'item')
    await driver.set('/about?sort=title', 'about')

    await expect(driver.deletePattern('/products/*')).resolves.toEqual(expect.arrayContaining(['/products/item?sort=title', '/products/item']))
    await expect(driver.get('/products/item?sort=title')).resolves.toBeNull()
    await expect(driver.get('/products/item')).resolves.toBeNull()
    await expect(driver.get('/about?sort=title')).resolves.toBe('about')
  })

  it('supports unicode URL path segments and rejects traversal keys', async () => {
    const driver = await createDriver()

    await driver.set('/café/東京', 'unicode')
    await expect(driver.get('/café/東京')).resolves.toBe('unicode')
    await expect(driver.set('/../outside', 'unsafe')).rejects.toThrow('Invalid cache key')
    await expect(driver.set('/safe/../../outside', 'unsafe')).rejects.toThrow('Invalid cache key')
    await expect(driver.set('/safe\\outside', 'unsafe')).rejects.toThrow('Invalid cache key')
  })

  it('keeps reserved storage names separate from authored URL segments', async () => {
    const driver = await createDriver()
    const keys = ['/', '/_root', '/products', '/products/index.html', '/products/%3Fsort=title', '/products?sort=title']
    for (const key of keys) await driver.set(key, key)
    for (const key of keys) await expect(driver.get(key)).resolves.toBe(key)
    expect((await driver.deletePattern('/*')).sort()).toEqual(keys.sort())
  })
})
