// Types
export type { Session, User, CreateUserInput, UpdateUserInput } from './types'

// Errors
export { AuthenticationError, NotFoundError, ConflictError } from './errors'

// Contracts
export type {
  AuthDriver,
  AuthDriverFactory,
  CredentialPayload,
} from './contracts/auth-driver'
export type {
  SessionStore,
  SessionStoreFactory,
} from './contracts/session-store'
export type {
  UserProvider,
  UserProviderFactory,
} from './contracts/user-provider'

// Registry
export { PluginRegistry } from './registry'

// Composer
export { compose } from './composer'
export type { AuthConfig, ComposedAuthService } from './composer'

// Defaults
export { registerDefaults } from './defaults'
export type { RegisterDefaultsOptions } from './defaults'
