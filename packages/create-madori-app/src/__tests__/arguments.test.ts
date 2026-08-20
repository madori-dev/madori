import { describe, expect, it } from 'vitest'
import { hasUnsupportedStarterFlag } from '../arguments.js'

describe('hasUnsupportedStarterFlag', () => {
  it.each(['marketing', 'blog', 'documentation', 'saas', 'agency'])(
    'rejects removed %s starter path',
    (starter) => {
      expect(hasUnsupportedStarterFlag(['site', '--starter', starter])).toBe(true)
    }
  )

  it('allows standard project creation arguments', () => {
    expect(hasUnsupportedStarterFlag(['site'])).toBe(false)
  })
})
