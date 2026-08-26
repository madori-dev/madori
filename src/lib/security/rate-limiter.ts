export interface RateLimitDecision {
  allowed: boolean
  retryAfterSeconds: number
}

/** Bounded in-process sliding-window limiter for single-writer deployments. */
export class SlidingWindowRateLimiter {
  private readonly attempts = new Map<string, number[]>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {
    if (limit < 1 || windowMs < 1 || maxKeys < 1) throw new Error('Rate limiter values must be positive.')
  }

  consume(key: string, now = Date.now()): RateLimitDecision {
    this.prune(now)
    if (!this.attempts.has(key) && this.attempts.size >= this.maxKeys) {
      let oldestKey: string | undefined
      let oldestAttempt = Number.POSITIVE_INFINITY
      for (const [candidate, timestamps] of this.attempts) {
        const latest = timestamps[timestamps.length - 1] ?? 0
        if (latest < oldestAttempt) {
          oldestKey = candidate
          oldestAttempt = latest
        }
      }
      if (oldestKey) this.attempts.delete(oldestKey)
    }

    const recent = (this.attempts.get(key) ?? []).filter((timestamp) => timestamp > now - this.windowMs)
    if (recent.length >= this.limit) {
      const retryAfterMs = Math.max(1, recent[0]! + this.windowMs - now)
      this.attempts.set(key, recent)
      return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) }
    }

    recent.push(now)
    this.attempts.set(key, recent)
    return { allowed: true, retryAfterSeconds: 0 }
  }

  reset(key: string): void {
    this.attempts.delete(key)
  }

  clear(): void {
    this.attempts.clear()
  }

  private prune(now: number): void {
    if (this.attempts.size < this.maxKeys) return
    for (const [key, timestamps] of this.attempts) {
      if (timestamps.every((timestamp) => timestamp <= now - this.windowMs)) this.attempts.delete(key)
    }
  }
}
