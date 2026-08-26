import { describe, expect, it } from 'vitest'
import nextConfig from '../../../next.config'

describe('production response headers', () => {
  it('sets baseline browser security headers for every route', async () => {
    expect(typeof nextConfig.headers).toBe('function')
    const rules = await nextConfig.headers!()
    const headers = Object.fromEntries(rules[0]!.headers.map((header) => [header.key, header.value]))

    expect(rules[0]!.source).toBe('/:path*')
    expect(headers).toEqual(expect.objectContaining({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    }))
  })
})
