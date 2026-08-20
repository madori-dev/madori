import { mkdir, open, readFile, rename, stat, unlink } from 'fs/promises'
import { randomUUID } from 'crypto'
import path from 'path'
import { GitError } from './errors'

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function withRepositoryLock<T>(statePath: string, repository: string, callback: () => Promise<T>, timeoutMs = 120_000, staleMs = 300_000): Promise<T> {
  if (timeoutMs <= 0 || staleMs <= 0) throw new GitError('Git lock timeouts must be positive', 'INVALID_INPUT')
  await mkdir(statePath, { recursive: true })
  const name = Buffer.from(repository).toString('base64url')
  const lockPath = path.join(statePath, `${name}.lock`)
  const until = Date.now() + timeoutMs
  while (true) {
    try {
      const file = await open(lockPath, 'wx')
      const token = randomUUID()
      let heartbeat: ReturnType<typeof setInterval> | undefined
      try {
        await file.writeFile(JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() }))
        // Active owners refresh mtime, so stale reclamation only targets abandoned locks.
        heartbeat = setInterval(() => { void file.utimes(new Date(), new Date()).catch(() => undefined) }, Math.max(100, Math.floor(staleMs / 3)))
        return await callback()
      }
      finally {
        if (heartbeat) clearInterval(heartbeat)
        await file.close()
        const stillOwner = await readFile(lockPath, 'utf8').then(value => JSON.parse(value).token === token).catch(() => false)
        if (stillOwner) await unlink(lockPath).catch(() => undefined)
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const age = await stat(lockPath).then(info => Date.now() - info.mtimeMs).catch(() => 0)
      if (age > staleMs) {
        const abandoned = `${lockPath}.stale-${randomUUID()}`
        await rename(lockPath, abandoned).then(() => unlink(abandoned)).catch(() => undefined)
        continue
      }
      if (Date.now() >= until) throw new GitError('Timed out waiting for repository sync lock', 'LOCK_TIMEOUT')
      await pause(100)
    }
  }
}
