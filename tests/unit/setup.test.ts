import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

describe('test infrastructure', () => {
  it('vitest runs correctly', () => {
    expect(true).toBe(true)
  })

  it('fast-check is available', () => {
    fc.assert(
      fc.property(fc.integer(), (n) => {
        return typeof n === 'number'
      })
    )
  })

  it('path alias @ resolves to src/', async () => {
    // Verify the path alias works by importing from @/lib/errors
    const errors = await import('@/lib/errors')
    expect(errors).toBeDefined()
  })
})
