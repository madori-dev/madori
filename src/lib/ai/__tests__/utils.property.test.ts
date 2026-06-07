import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { maskApiKey } from '../utils'

/**
 * Property 17: API key masking never exposes more than 8 characters
 * **Validates: Requirements 12.1**
 */
describe('maskApiKey – Property 17', () => {
  const BULLET = '•'

  function visibleChars(masked: string): string {
    return masked.replace(new RegExp(BULLET, 'g'), '')
  }

  it('never exposes more than 8 visible characters for any input', () => {
    fc.assert(
      fc.property(fc.string(), (key) => {
        const result = maskApiKey(key)
        const visible = visibleChars(result)
        expect(visible.length).toBeLessThanOrEqual(8)
      }),
    )
  })

  it('fully masks keys of 8 characters or fewer', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 8 }),
        (key) => {
          const result = maskApiKey(key)
          expect(result).toBe('••••••••')
        },
      ),
    )
  })

  it('shows exactly 4 prefix + bullet middle + 4 suffix for keys longer than 8 chars', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 9 }),
        (key) => {
          const result = maskApiKey(key)
          expect(result).toBe(key.slice(0, 4) + '••••' + key.slice(-4))
        },
      ),
    )
  })

  it('visible prefix matches first 4 characters of original key', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 9 }),
        (key) => {
          const result = maskApiKey(key)
          expect(result.slice(0, 4)).toBe(key.slice(0, 4))
        },
      ),
    )
  })

  it('visible suffix matches last 4 characters of original key', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 9 }),
        (key) => {
          const result = maskApiKey(key)
          expect(result.slice(-4)).toBe(key.slice(-4))
        },
      ),
    )
  })
})
