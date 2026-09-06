import type { AuthDriver } from './contracts/auth-driver'
import type { SessionStore } from './contracts/session-store'
import type { UserProvider } from './contracts/user-provider'
import type { Session, User, CreateUserInput, UpdateUserInput } from './types'
import type { PluginRegistry } from './registry'

export interface AuthConfig {
  driver: string
  store: string
  provider: string
  driverConfig?: Record<string, unknown>
  storeConfig?: Record<string, unknown>
  providerConfig?: Record<string, unknown>
}

export interface ComposedAuthService {
  login(identifier: string, credentials: Record<string, unknown>): Promise<Session>
  logout(token: string): Promise<void>
  validateSession(token: string): Promise<Session | null>
  getUser(id: string): Promise<User>
  getUserByEmail(email: string): Promise<User | null>
  listUsers(): Promise<User[]>
  createUser(input: CreateUserInput): Promise<User>
  updateUser(id: string, input: UpdateUserInput): Promise<User>
  deleteUser(id: string): Promise<void>
}

const authLifecycle = Symbol('authLifecycle')
const lifecycleLocks = new Map<string | symbol, Promise<void>>()

async function withLifecycleLock<T>(userId: string | symbol, operation: () => Promise<T>): Promise<T> {
  const previous = lifecycleLocks.get(userId) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  lifecycleLocks.set(userId, current)
  await previous
  try {
    return await operation()
  } finally {
    release()
    if (lifecycleLocks.get(userId) === current) lifecycleLocks.delete(userId)
  }
}

async function revokeSessions(store: SessionStore, userId: string): Promise<void> {
  if (!store.revokeUserSessions) {
    throw new Error('Configured session store does not support user session revocation')
  }
  await store.revokeUserSessions(userId)
}

/**
 * Composes a working auth service from one AuthDriver, one SessionStore,
 * and one UserProvider resolved from the PluginRegistry.
 *
 * Validates that all three contracts are resolved before returning the service.
 * Wires the login flow: validateCredentials → createSession → update lastLogin.
 */
export function compose(registry: PluginRegistry, config: AuthConfig): ComposedAuthService {
  // Resolve all three factories — each throws NotFoundError if missing
  const providerFactory = registry.resolveProvider(config.provider)
  const storeFactory = registry.resolveStore(config.store)
  const driverFactory = registry.resolveDriver(config.driver)

  // Instantiate adapters
  const provider: UserProvider = providerFactory.create(config.providerConfig ?? {})
  const store: SessionStore = storeFactory.create(config.storeConfig ?? {})
  const driver: AuthDriver = driverFactory.create(config.driverConfig ?? {})

  return {
    async login(identifier, credentials) {
      return withLifecycleLock(authLifecycle, async () => {
        const userId = await driver.validateCredentials(identifier, credentials)
        return withLifecycleLock(userId, async () => {
          const session = await store.createSession(userId)

          // Update last login timestamp
          await provider.update(userId, {
            lastLogin: new Date().toISOString(),
          })

          return session
        })
      })
    },

    async logout(token) {
      await store.destroySession(token)
    },

    async validateSession(token) {
      return store.validateSession(token)
    },

    async getUser(id) {
      return provider.getById(id)
    },

    async getUserByEmail(email) {
      return provider.getByEmail(email)
    },

    async listUsers() {
      return provider.list()
    },

    async createUser(input) {
      return provider.create(input)
    },

    async updateUser(id, input) {
      if (input.password === undefined) return provider.update(id, input)
      return withLifecycleLock(authLifecycle, async () => {
        return withLifecycleLock(id, async () => {
          await revokeSessions(store, id)
          return provider.update(id, input)
        })
      })
    },

    async deleteUser(id) {
      return withLifecycleLock(authLifecycle, async () => {
        return withLifecycleLock(id, async () => {
          await revokeSessions(store, id)
          return provider.delete(id)
        })
      })
    },
  }
}
