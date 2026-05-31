import { AuthenticationError } from '@/lib/errors'
import { verifyPassword } from '../password'
import type { AuthDriver, AuthDriverFactory, CredentialPayload } from '../contracts/auth-driver'
import type { UserProvider } from '../contracts/user-provider'

export class PasswordAuthDriver implements AuthDriver {
  constructor(private readonly userProvider: UserProvider) {}

  async validateCredentials(
    identifier: string,
    credentials: CredentialPayload
  ): Promise<string> {
    const password = credentials.password as string
    if (!password) {
      throw new AuthenticationError()
    }

    const user = await this.userProvider.getByEmail(identifier)
    if (!user) {
      throw new AuthenticationError()
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      throw new AuthenticationError()
    }

    return user.id
  }
}

export class PasswordAuthDriverFactory implements AuthDriverFactory {
  constructor(private readonly userProvider: UserProvider) {}

  create(_config: Record<string, unknown>): AuthDriver {
    return new PasswordAuthDriver(this.userProvider)
  }
}
