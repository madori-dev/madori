import type { Session } from '../types'

export interface SessionStore {
  /**
   * Create a new session for the given user.
   * Must generate a cryptographically random token.
   */
  createSession(userId: string): Promise<Session>

  /**
   * Validate a session by its token.
   * Returns the Session if valid and unexpired, null otherwise.
   * Must remove expired sessions from storage when encountered.
   */
  validateSession(token: string): Promise<Session | null>

  /**
   * Destroy a session by its token.
   * Subsequent validateSession calls with this token must return null.
   */
  destroySession(token: string): Promise<void>

  /**
   * Remove all expired sessions from storage.
   * @returns The number of expired sessions removed.
   */
  cleanExpired(): Promise<number>
}

export interface SessionStoreFactory {
  create(config: Record<string, unknown>): SessionStore
}
