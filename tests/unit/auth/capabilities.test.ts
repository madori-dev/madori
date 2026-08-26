import { describe, expect, it } from 'vitest'

import { applyFeatureAvailability } from '@/lib/auth/capabilities'

describe('effective Control Panel capabilities', () => {
  it('removes every SEO capability when SEO is disabled', () => {
    const capabilities = applyFeatureAvailability({
      'collections:view': true,
      'seo:view': true,
      'seo:edit': true,
      'seo-reports:view': true,
      'seo-redirects:edit': true,
      'seo-errors:delete': true,
    }, { seo: false })

    expect(capabilities).toEqual({
      'collections:view': true,
      'seo:view': false,
      'seo:edit': false,
      'seo-reports:view': false,
      'seo-redirects:edit': false,
      'seo-errors:delete': false,
    })
  })

  it('preserves authorized SEO capabilities when SEO is enabled', () => {
    const capabilities = applyFeatureAvailability({
      'seo:view': true,
      'seo:edit': false,
    }, { seo: true })

    expect(capabilities).toEqual({
      'seo:view': true,
      'seo:edit': false,
    })
  })
})
