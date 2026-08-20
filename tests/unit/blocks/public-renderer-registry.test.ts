import { describe, expect, it } from 'vitest'

import { hasPublicBlockRenderer, publicBlockTypes } from '@/components/blocks'

describe('public block renderer registry', () => {
  it('only permits fieldset handles backed by a public renderer', () => {
    expect(publicBlockTypes).toEqual(expect.arrayContaining(['hero', 'basic_cta', 'features_grid']))
    expect(hasPublicBlockRenderer('hero')).toBe(true)
    expect(hasPublicBlockRenderer('cp_only_experiment')).toBe(false)
  })
})
