import { randomBytes, randomUUID, createHash } from 'crypto'
import * as path from 'path'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import { AtomicFileWriter } from '@/lib/fs/atomic-writer'
import type { Session } from '../types'
import type { SessionStore, SessionStoreFactory } from '../contracts/session-store'

const DEFAULT_SESSION_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours

interface SessionFileData {
  id: string
  userId: string
  expiresAt: string
}

export class FileSessionStore implements SessionStore {
  private readonly atomicWriter: AtomicFileWriter

  constructor(
    private readonly sessionsDir: string,
    private readonly fs: FileSystemAdapter,
    private readonly sessionDurationMs: number = DEFAULT_SESSION_DURATION_MS
  ) {
    this.atomicWriter = new AtomicFileWriter(fs)
  }

  private sessionFilePath(token: string): string {
    const hash = createHash('sha256').update(token).digest('hex')
    return path.join(this.sessionsDir, `${hash}.json`)
  }

  async createSession(userId: string): Promise<Session> {
    const session: Session = {
      id: randomUUID(),
      userId,
      token: randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + this.sessionDurationMs).toISOString(),
    }

    const filePath = this.sessionFilePath(session.token)
    const data: SessionFileData = {
      id: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
    }

    await this.fs.mkdir(this.sessionsDir)
    await this.restrictPath(this.sessionsDir, 0o700)
    const result = await this.atomicWriter.writeFileAtomic(filePath, JSON.stringify(data, null, 2), { mode: 0o600 })
    if (!result.success) throw result.error ?? new Error(`Could not create session: ${session.id}`)
    return session
  }

  async validateSession(token: string): Promise<Session | null> {
    const filePath = this.sessionFilePath(token)
    const exists = await this.fs.exists(filePath)
    if (!exists) {
      return null
    }
    await this.restrictPath(this.sessionsDir, 0o700)
    await this.restrictPath(filePath)

    let data: SessionFileData
    try {
      const parsed: unknown = JSON.parse(await this.fs.readFile(filePath))
      if (!isSessionFileData(parsed)) throw new Error('Invalid session data')
      data = parsed
    } catch {
      await this.fs.deleteFile(filePath)
      return null
    }

    const now = new Date()
    const expiresAt = new Date(data.expiresAt)
    if (now >= expiresAt) {
      // Expired — remove from disk
      await this.fs.deleteFile(filePath)
      return null
    }

    return {
      id: data.id,
      userId: data.userId,
      token,
      expiresAt: data.expiresAt,
    }
  }

  async destroySession(token: string): Promise<void> {
    const filePath = this.sessionFilePath(token)
    const exists = await this.fs.exists(filePath)
    if (exists) {
      await this.fs.deleteFile(filePath)
    }
  }

  async cleanExpired(): Promise<number> {
    const dirExists = await this.fs.exists(this.sessionsDir)
    if (!dirExists) return 0
    await this.restrictPath(this.sessionsDir, 0o700)

    const files = await this.fs.listFiles(this.sessionsDir, '*.json')
    let removed = 0
    const now = new Date()

    for (const file of files) {
      const filePath = path.join(this.sessionsDir, file)
      await this.restrictPath(filePath)
      const raw = await this.fs.readFile(filePath)
      try {
        const parsed: unknown = JSON.parse(raw)
        if (!isSessionFileData(parsed)) throw new Error('Invalid session data')
        const data = parsed
        if (now >= new Date(data.expiresAt)) {
          await this.fs.deleteFile(filePath)
          removed++
        }
      } catch {
        // Malformed file — remove it
        await this.fs.deleteFile(filePath)
        removed++
      }
    }

    return removed
  }

  private async restrictPath(filePath: string, mode = 0o600): Promise<void> {
    if (this.fs.chmod) await this.fs.chmod(filePath, mode)
  }
}

function isSessionFileData(value: unknown): value is SessionFileData {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  return typeof data.id === 'string'
    && typeof data.userId === 'string'
    && typeof data.expiresAt === 'string'
    && Number.isFinite(Date.parse(data.expiresAt))
}

export class FileSessionStoreFactory implements SessionStoreFactory {
  constructor(private readonly fs: FileSystemAdapter) {}

  create(config: Record<string, unknown>): SessionStore {
    const sessionsDir = (config.sessionsDir as string) ?? './.sessions'
    const durationMs = (config.sessionDurationMs as number) ?? DEFAULT_SESSION_DURATION_MS
    return new FileSessionStore(sessionsDir, this.fs, durationMs)
  }
}
