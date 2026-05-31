/**
 * Credential payload is intentionally open — password drivers receive
 * { password: string }, OAuth drivers receive { code: string }, etc.
 */
export interface CredentialPayload {
  [key: string]: unknown
}

export interface AuthDriver {
  /**
   * Validate the given credentials for the identified user.
   * @param identifier - User identifier (email, username, etc.)
   * @param credentials - Driver-specific credential payload
   * @returns The authenticated user's canonical id
   * @throws AuthenticationError if credentials are invalid
   */
  validateCredentials(
    identifier: string,
    credentials: CredentialPayload
  ): Promise<string>
}

export interface AuthDriverFactory {
  create(config: Record<string, unknown>): AuthDriver
}
