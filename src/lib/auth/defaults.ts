import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'
import type { UserProvider } from './contracts/user-provider'
import { PasswordAuthDriverFactory } from './drivers/password'
import { FileSessionStoreFactory } from './stores/file'
import { YamlUserProviderFactory } from './providers/yaml'
import type { PluginRegistry } from './registry'

export interface RegisterDefaultsOptions {
  fs: FileSystemAdapter
  parser: ContentParser
  userProvider: UserProvider
}

/**
 * Register the built-in default adapters on the given registry:
 * - "password" AuthDriver (requires a UserProvider for credential lookup)
 * - "file" SessionStore (requires a FileSystemAdapter)
 * - "yaml" UserProvider (requires FileSystemAdapter + ContentParser)
 */
export function registerDefaults(
  registry: PluginRegistry,
  options: RegisterDefaultsOptions
): void {
  registry.registerProvider('yaml', new YamlUserProviderFactory(options.fs, options.parser))
  registry.registerStore('file', new FileSessionStoreFactory(options.fs))
  registry.registerDriver('password', new PasswordAuthDriverFactory(options.userProvider))
}
