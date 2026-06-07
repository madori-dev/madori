import { describe, it, expect } from 'vitest'
import { maskApiKey } from '../utils'

describe('maskApiKey', () => {
  it('fully masks keys with 8 or fewer characters', () => {
    expect(maskApiKey('')).toBe('••••••••')
    expect(maskApiKey('abc')).toBe('••••••••')
    expect(maskApiKey('12345678')).toBe('••••••••')
  })

  it('shows first 4 + •••• + last 4 for keys longer than 8 characters', () => {
    expect(maskApiKey('123456789')).toBe('1234••••6789')
    expect(maskApiKey('sk-abc123xyz789')).toBe('sk-a••••z789')
  })

  it('never exposes more than 8 characters total', () => {
    const longKey = 'mdk_' + 'a'.repeat(100)
    const masked = maskApiKey(longKey)
    const visibleChars = masked.replace(/•/g, '')
    expect(visibleChars.length).toBeLessThanOrEqual(8)
  })
})
