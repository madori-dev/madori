import { describe, expect, it, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import { YamlUserProvider } from '@/lib/auth/providers/yaml'
import { FileSessionStore } from '@/lib/auth/stores/file'
import { compose } from '@/lib/auth/composer'
import { PluginRegistry } from '@/lib/auth/registry'
import { PasswordAuthDriverFactory } from '@/lib/auth/drivers/password'
import type { Session } from '@/lib/auth/types'

const temporaryDirectories: string[] = []

async function makeDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'madori-auth-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('account security', () => {
  it('revokes every file session for a user', async () => {
    const directory = await makeDirectory()
    const store = new FileSessionStore(path.join(directory, 'sessions'), new NodeFileSystemAdapter())
    const first = await store.createSession('editor')
    const second = await store.createSession('editor')
    const other = await store.createSession('other')

    await store.revokeUserSessions('editor')

    await expect(store.validateSession(first.token)).resolves.toBeNull()
    await expect(store.validateSession(second.token)).resolves.toBeNull()
    await expect(store.validateSession(other.token)).resolves.toMatchObject({ userId: 'other' })
  })

  it('propagates session deletion failures during revocation', async () => {
    const directory = await makeDirectory()
    const baseFs = new NodeFileSystemAdapter()
    const store = new FileSessionStore(path.join(directory, 'sessions'), baseFs)
    await store.createSession('editor')
    const failingFs = Object.assign(Object.create(Object.getPrototypeOf(baseFs)), baseFs, {
      deleteFile: async (filePath: string) => {
        if (filePath.includes(`${path.sep}sessions${path.sep}`)) throw new Error('disk unavailable')
        return baseFs.deleteFile(filePath)
      },
    })
    const failingStore = new FileSessionStore(path.join(directory, 'sessions'), failingFs)

    await expect(failingStore.revokeUserSessions('editor')).rejects.toThrow('disk unavailable')
  })

  it('aborts revocation when a session cannot be read', async () => {
    const directory = await makeDirectory()
    const fs = new NodeFileSystemAdapter()
    const store = new FileSessionStore(path.join(directory, 'sessions'), fs)
    await store.createSession('editor')
    const read = fs.readFile.bind(fs)
    fs.readFile = async (file) => {
      if (file.endsWith('.json')) throw new Error('session read failed')
      return read(file)
    }
    await expect(store.revokeUserSessions('editor')).rejects.toThrow('session read failed')
  })

  it('normalizes email lookup and rejects concurrent duplicate creates', async () => {
    const directory = await makeDirectory()
    const provider = new YamlUserProvider(
      path.join(directory, 'users'),
      new NodeFileSystemAdapter(),
      new MarkdownYamlParser(),
    )

    const create = (id: string) => provider.create({
      id,
      email: id === 'first' ? 'EDITOR@EXAMPLE.COM' : ' editor@example.com ',
      name: id,
      password: 'safe-password-123',
      roles: [],
    })
    const results = await Promise.allSettled([create('first'), create('second')])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    await expect(provider.getByEmail('EDITOR@example.com')).resolves.toMatchObject({ email: 'editor@example.com' })
  })

  it('serializes profile and last-login updates without losing either change', async () => {
    const directory = await makeDirectory()
    const provider = new YamlUserProvider(
      path.join(directory, 'users'),
      new NodeFileSystemAdapter(),
      new MarkdownYamlParser(),
    )
    await provider.create({
      id: 'editor',
      email: 'editor@example.com',
      name: 'Original',
      password: 'safe-password-123',
      roles: ['editor'],
    })

    await Promise.all([
      provider.update('editor', { name: 'Updated' }),
      provider.update('editor', { lastLogin: '2026-09-06T00:00:00.000Z' }),
    ])

    await expect(provider.getById('editor')).resolves.toMatchObject({
      name: 'Updated',
      lastLogin: '2026-09-06T00:00:00.000Z',
      roles: ['editor'],
    })
  })

  it('revokes sessions through composed password reset and delete/recreate lifecycle', async () => {
    const directory = await makeDirectory()
    const fs = new NodeFileSystemAdapter()
    const provider = new YamlUserProvider(path.join(directory, 'users'), fs, new MarkdownYamlParser())
    const store = new FileSessionStore(path.join(directory, 'sessions'), fs)
    await provider.create({ id: 'editor', email: 'editor@example.com', name: 'Editor', password: 'safe-password-123', roles: ['editor'] })

    const registry = new PluginRegistry()
    registry.registerProvider('yaml', { create: () => provider })
    registry.registerStore('file', { create: () => store })
    registry.registerDriver('password', { create: () => new PasswordAuthDriverFactory(provider).create({}) })
    const auth = compose(registry, { driver: 'password', store: 'file', provider: 'yaml' })

    const session = await auth.login('EDITOR@example.com', { password: 'safe-password-123' })
    await auth.updateUser('editor', { password: 'new-password-123' })
    await expect(auth.validateSession(session.token)).resolves.toBeNull()

    const replacementSession = await auth.login('editor@example.com', { password: 'new-password-123' })
    await auth.deleteUser('editor')
    await provider.create({ id: 'editor', email: 'new@example.com', name: 'Replacement', password: 'safe-password-123', roles: ['admin'] })
    await expect(auth.validateSession(session.token)).resolves.toBeNull()
    await expect(auth.validateSession(replacementSession.token)).resolves.toBeNull()
  })

  it('rejects sensitive lifecycle changes when custom store cannot revoke sessions', async () => {
    const session: Session = { id: 's', userId: 'editor', token: 'token', expiresAt: new Date(Date.now() + 60_000).toISOString() }
    const provider = {
      getById: async () => ({ id: 'editor', email: 'editor@example.com', name: 'Editor', roles: [], passwordHash: 'hash', createdAt: new Date().toISOString() }),
      getByEmail: async () => null,
      list: async () => [],
      create: async () => { throw new Error('unused') },
      update: async () => { throw new Error('must not update') },
      delete: async () => { throw new Error('must not delete') },
    }
    const registry = new PluginRegistry()
    registry.registerProvider('custom', { create: () => provider })
    registry.registerStore('custom', { create: () => ({
      createSession: async () => session,
      validateSession: async () => session,
      destroySession: async () => undefined,
      cleanExpired: async () => 0,
    }) })
    registry.registerDriver('custom', { create: () => ({ validateCredentials: async () => 'editor' }) })
    const auth = compose(registry, { driver: 'custom', store: 'custom', provider: 'custom' })

    await expect(auth.updateUser('editor', { password: 'new-password-123' })).rejects.toThrow(/does not support user session revocation/)
    await expect(auth.deleteUser('editor')).rejects.toThrow(/does not support user session revocation/)
  })
})
