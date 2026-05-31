import { randomBytes, randomUUID, createHash } from 'crypto'
import * as path from 'path'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { Session } from '../types'
import type { SessionStore, SessionStoreFactory } from '../contracts/session-store'

const DEFAULT_SESSION_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours

interface SessionFileData {
  id: string
  userId: string
  token: string
  expiresAt: string
}

export class FileSessionStore implements SessionStore {
  constructor(
    private readonly sessionsDir: string,
    private readonly fs: FileSystemAdapter,
    private readonly sessionDurationMs: number = DEFAULT_SESSION_DURATION_MS
  ) {}

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
      token: session.token,
      expiresAt: session.expiresAt,
    }

    await this.fs.writeFile(filePath, JSON.stringify(data, null, 2))
    return session
  }

  async validateSession(token: string): Promise<Session | null> {
    const filePath = this.sessionFilePath(token)
    const exists = await this.fs.exists(filePath)
    if (!exists) {
      return null
    }

    const raw = await this.fs.readFile(filePath)
    const data: SessionFileData = JSON.parse(raw)

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
      token: data.token,
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

    const files = await this.fs.listFiles(this.sessionsDir, '*.json')
    let removed = 0
    const now = new Date()

    for (const file of files) {
      const filePath = path.join(this.sessionsDir, file)
      const raw = await this.fs.readFile(filePath)
      try {
        const data: SessionFileData = JSON.parse(raw)
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
}

export class FileSessionStoreFactory implements SessionStoreFactory {
  constructor(private readonly fs: FileSystemAdapter) {}

  create(config: Record<string, unknown>): SessionStore {
    const sessionsDir = (config.sessionsDir as string) ?? './.sessions'
    const durationMs = (config.sessionDurationMs as number) ?? DEFAULT_SESSION_DURATION_MS
    return new FileSessionStore(sessionsDir, this.fs, durationMs)
  }
}
