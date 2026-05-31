import { describe, it, expect } from 'vitest'
import { PluginRegistry } from '@/lib/auth/registry'
import { registerDefaults } from '@/lib/auth/defaults'
import { PasswordAuthDriverFactory } from '@/lib/auth/drivers/password'
import { FileSessionStoreFactory } from '@/lib/auth/stores/file'
import { YamlUserProviderFactory } from '@/lib/auth/providers/yaml'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'
import type { UserProvider } from '@/lib/auth/contracts/user-provider'

const stubFs: FileSystemAdapter = {
  readFile: async () => '',
  writeFile: async () => {},
  deleteFile: async () => {},
  exists: async () => false,
  listFiles: async () => [],
  listDirectories: async () => [],
  mkdir: async () => {},
  copyFile: async () => {},
  moveFile: async () => {},
}

const stubParser: ContentParser = {
  parseMarkdown: () => ({ frontmatter: {}, content: '' }),
  serializeMarkdown: () => '',
  parseYaml: () => ({}) as never,
  serializeYaml: () => '',
}

const stubUserProvider: UserProvider = {
  getById: async () => ({ id: '1', email: '', name: '', roles: [], passwordHash: '', createdAt: '' }),
  getByEmail: async () => null,
  list: async () => [],
  create: async (input) => ({ id: input.id, email: input.email, name: input.name, roles: input.roles, passwordHash: '', createdAt: '' }),
  update: async () => ({ id: '1', email: '', name: '', roles: [], passwordHash: '', createdAt: '' }),
  delete: async () => {},
}

describe('registerDefaults', () => {
  it('registers "password" driver, "file" store, and "yaml" provider', () => {
    const registry = new PluginRegistry()

    registerDefaults(registry, {
      fs: stubFs,
      parser: stubParser,
      userProvider: stubUserProvider,
    })

    expect(registry.has('driver', 'password')).toBe(true)
    expect(registry.has('store', 'file')).toBe(true)
    expect(registry.has('provider', 'yaml')).toBe(true)
  })

  it('resolves factories of correct types', () => {
    const registry = new PluginRegistry()

    registerDefaults(registry, {
      fs: stubFs,
      parser: stubParser,
      userProvider: stubUserProvider,
    })

    const driver = registry.resolveDriver('password')
    const store = registry.resolveStore('file')
    const provider = registry.resolveProvider('yaml')

    expect(driver).toBeInstanceOf(PasswordAuthDriverFactory)
    expect(store).toBeInstanceOf(FileSessionStoreFactory)
    expect(provider).toBeInstanceOf(YamlUserProviderFactory)
  })

  it('throws ConflictError if called twice on same registry', () => {
    const registry = new PluginRegistry()
    const opts = { fs: stubFs, parser: stubParser, userProvider: stubUserProvider }

    registerDefaults(registry, opts)

    expect(() => registerDefaults(registry, opts)).toThrow(
      'UserProvider "yaml" is already registered',
    )
  })
})
