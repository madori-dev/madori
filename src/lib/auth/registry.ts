import type { AuthDriverFactory } from './contracts/auth-driver'
import type { SessionStoreFactory } from './contracts/session-store'
import type { UserProviderFactory } from './contracts/user-provider'
import { ConflictError, NotFoundError } from '@/lib/errors'

type ContractType = 'driver' | 'store' | 'provider'

export class PluginRegistry {
  private drivers = new Map<string, AuthDriverFactory>()
  private stores = new Map<string, SessionStoreFactory>()
  private providers = new Map<string, UserProviderFactory>()

  registerDriver(name: string, factory: AuthDriverFactory): void {
    if (this.drivers.has(name)) {
      throw new ConflictError(`AuthDriver "${name}" is already registered`)
    }
    this.drivers.set(name, factory)
  }

  registerStore(name: string, factory: SessionStoreFactory): void {
    if (this.stores.has(name)) {
      throw new ConflictError(`SessionStore "${name}" is already registered`)
    }
    this.stores.set(name, factory)
  }

  registerProvider(name: string, factory: UserProviderFactory): void {
    if (this.providers.has(name)) {
      throw new ConflictError(`UserProvider "${name}" is already registered`)
    }
    this.providers.set(name, factory)
  }

  resolveDriver(name: string): AuthDriverFactory {
    const factory = this.drivers.get(name)
    if (!factory) {
      throw new NotFoundError('AuthDriver', name)
    }
    return factory
  }

  resolveStore(name: string): SessionStoreFactory {
    const factory = this.stores.get(name)
    if (!factory) {
      throw new NotFoundError('SessionStore', name)
    }
    return factory
  }

  resolveProvider(name: string): UserProviderFactory {
    const factory = this.providers.get(name)
    if (!factory) {
      throw new NotFoundError('UserProvider', name)
    }
    return factory
  }

  has(type: ContractType, name: string): boolean {
    switch (type) {
      case 'driver': return this.drivers.has(name)
      case 'store': return this.stores.has(name)
      case 'provider': return this.providers.has(name)
    }
  }
}
