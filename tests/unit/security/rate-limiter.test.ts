import { describe, expect, it } from 'vitest'
import { SlidingWindowRateLimiter } from '@/lib/security/rate-limiter'

describe('SlidingWindowRateLimiter', () => {
  it('blocks attempts over limit and reports remaining window', () => {
    const limiter = new SlidingWindowRateLimiter(2, 10_000)

    expect(limiter.consume('account', 1_000).allowed).toBe(true)
    expect(limiter.consume('account', 2_000).allowed).toBe(true)
    expect(limiter.consume('account', 3_000)).toEqual({ allowed: false, retryAfterSeconds: 8 })
    expect(limiter.consume('account', 11_001).allowed).toBe(true)
  })

  it('resets successful account and bounds attacker-created keys', () => {
    const limiter = new SlidingWindowRateLimiter(1, 10_000, 1)
    expect(limiter.consume('first', 1_000).allowed).toBe(true)
    expect(limiter.consume('second', 1_001).allowed).toBe(true)
    expect(limiter.consume('first', 1_002).allowed).toBe(true)
    limiter.reset('first')
  })
})
