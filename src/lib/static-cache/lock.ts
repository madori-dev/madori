export class CacheLock {
  private locks: Map<
    string,
    {
      promise: Promise<string | null>
      resolve: (html: string | null) => void
      reject: (error: Error) => void
    }
  > = new Map()

  acquire(key: string): 'acquired' | Promise<string | null> {
    const existing = this.locks.get(key)
    if (existing) {
      // Another request is already rendering this URL — wait for it
      return existing.promise
    }

    // Create a new lock
    let resolve!: (html: string | null) => void
    let reject!: (error: Error) => void
    const promise = new Promise<string | null>((res, rej) => {
      resolve = res
      reject = rej
    })
    this.locks.set(key, { promise, resolve, reject })
    return 'acquired'
  }

  release(key: string, html: string | null): void {
    const lock = this.locks.get(key)
    if (lock) {
      lock.resolve(html)
      this.locks.delete(key)
    }
  }

  fail(key: string, error: Error): void {
    const lock = this.locks.get(key)
    if (lock) {
      lock.reject(error)
      this.locks.delete(key)
    }
  }
}
