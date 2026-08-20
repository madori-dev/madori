import { afterEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { getDriver, handleStaticCache } from '@/lib/static-cache/middleware'
import type { StaticCacheConfig } from '@/lib/config/schema'

const config: StaticCacheConfig = {
  enabled: true,
  driver: 'application',
  storagePath: 'storage/static-cache/',
  exclude: [],
  queryStrings: 'ignore',
  warmOnInvalidate: false,
  invalidationRules: [],
}

describe('site-scoped static cache', () => {
  afterEach(async () => getDriver(config).clear())

  it('keeps identical paths isolated between configured sites', async () => {
    const driver = getDriver(config)
    await driver.set('/_sites/en/about', '<html>English</html>')
    await driver.set('/_sites/fr/about', '<html>Français</html>')
    const request = new NextRequest('https://example.test/about')

    const english = await handleStaticCache(request, config, '/cp', 'en')
    const french = await handleStaticCache(request, config, '/cp', 'fr')

    expect(await english?.text()).toBe('<html>English</html>')
    expect(await french?.text()).toBe('<html>Français</html>')
  })
})
