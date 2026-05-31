import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import { YamlUserProvider, YamlUserProviderFactory } from '@/lib/auth/providers/yaml'
import { NotFoundError, ConflictError } from '@/lib/errors'

describe('YamlUserProvider', () => {
  let provider: YamlUserProvider
  let tmpDir: string
  const fsAdapter = new NodeFileSystemAdapter()
  const parser = new MarkdownYamlParser()

  beforeEach(async () => {
    tmpDir = path.join(process.cwd(), 'tests', '.tmp', `users-${Date.now()}`)
    await fs.mkdir(tmpDir, { recursive: true })
    provider = new YamlUserProvider(tmpDir, fsAdapter, parser)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  function writeUserYaml(id: string, data: Record<string, unknown>) {
    const content = parser.serializeYaml(data)
    return fs.writeFile(path.join(tmpDir, `${id}.yaml`), content, 'utf-8')
  }

  const sampleUserYaml = {
    id: 'user-1',
    email: 'alice@example.com',
    name: 'Alice',
    roles: ['admin'],
    password_hash: 'scrypt:abc:def',
    created_at: '2024-01-01T00:00:00.000Z',
    last_login: '2024-06-01T12:00:00.000Z',
  }

  describe('getById', () => {
    it('returns user when file exists', async () => {
      await writeUserYaml('user-1', sampleUserYaml)

      const user = await provider.getById('user-1')

      expect(user.id).toBe('user-1')
      expect(user.email).toBe('alice@example.com')
      expect(user.name).toBe('Alice')
      expect(user.roles).toEqual(['admin'])
      expect(user.passwordHash).toBe('scrypt:abc:def')
      expect(user.createdAt).toBe('2024-01-01T00:00:00.000Z')
      expect(user.lastLogin).toBe('2024-06-01T12:00:00.000Z')
    })

    it('throws NotFoundError when file does not exist', async () => {
      await expect(provider.getById('nonexistent')).rejects.toThrow(NotFoundError)
    })

    it('maps snake_case YAML fields to camelCase', async () => {
      await writeUserYaml('user-2', {
        id: 'user-2',
        email: 'bob@test.com',
        name: 'Bob',
        roles: ['editor'],
        password_hash: 'scrypt:salt:hash',
        created_at: '2024-03-15T10:00:00.000Z',
      })

      const user = await provider.getById('user-2')

      expect(user.passwordHash).toBe('scrypt:salt:hash')
      expect(user.createdAt).toBe('2024-03-15T10:00:00.000Z')
      expect(user.lastLogin).toBeUndefined()
    })
  })

  describe('getByEmail', () => {
    it('returns user matching email', async () => {
      await writeUserYaml('user-1', sampleUserYaml)
      await writeUserYaml('user-2', { ...sampleUserYaml, id: 'user-2', email: 'bob@test.com' })

      const user = await provider.getByEmail('bob@test.com')

      expect(user).not.toBeNull()
      expect(user!.id).toBe('user-2')
    })

    it('returns null when no user matches email', async () => {
      await writeUserYaml('user-1', sampleUserYaml)

      const user = await provider.getByEmail('nobody@test.com')

      expect(user).toBeNull()
    })
  })

  describe('list', () => {
    it('returns all users from YAML files', async () => {
      await writeUserYaml('user-1', sampleUserYaml)
      await writeUserYaml('user-2', { ...sampleUserYaml, id: 'user-2', email: 'bob@test.com' })

      const users = await provider.list()

      expect(users).toHaveLength(2)
      expect(users.map((u) => u.id).sort()).toEqual(['user-1', 'user-2'])
    })

    it('returns empty array when directory does not exist', async () => {
      const emptyProvider = new YamlUserProvider(
        path.join(tmpDir, 'nonexistent'),
        fsAdapter,
        parser
      )

      const users = await emptyProvider.list()

      expect(users).toEqual([])
    })

    it('returns empty array when directory is empty', async () => {
      const users = await provider.list()

      expect(users).toEqual([])
    })
  })

  describe('create', () => {
    it('creates user YAML file and returns user', async () => {
      const input = {
        id: 'new-user',
        email: 'new@test.com',
        name: 'New User',
        password: 'secret123',
        roles: ['editor'],
      }

      const user = await provider.create(input)

      expect(user.id).toBe('new-user')
      expect(user.email).toBe('new@test.com')
      expect(user.name).toBe('New User')
      expect(user.roles).toEqual(['editor'])
      expect(user.passwordHash).toMatch(/^scrypt:/)
      expect(user.createdAt).toBeDefined()
    })

    it('writes snake_case YAML to disk', async () => {
      const input = {
        id: 'yaml-test',
        email: 'yaml@test.com',
        name: 'YAML Test',
        password: 'pass',
        roles: ['admin'],
      }

      await provider.create(input)

      const raw = await fs.readFile(path.join(tmpDir, 'yaml-test.yaml'), 'utf-8')
      expect(raw).toContain('password_hash:')
      expect(raw).toContain('created_at:')
      expect(raw).not.toContain('passwordHash')
      expect(raw).not.toContain('createdAt')
    })

    it('throws ConflictError when id already exists', async () => {
      await writeUserYaml('existing', sampleUserYaml)

      const input = {
        id: 'existing',
        email: 'dup@test.com',
        name: 'Duplicate',
        password: 'pass',
        roles: [],
      }

      await expect(provider.create(input)).rejects.toThrow(ConflictError)
    })
  })

  describe('update', () => {
    it('updates specified fields', async () => {
      await writeUserYaml('user-1', sampleUserYaml)

      const updated = await provider.update('user-1', {
        email: 'newemail@test.com',
        name: 'Alice Updated',
      })

      expect(updated.email).toBe('newemail@test.com')
      expect(updated.name).toBe('Alice Updated')
      expect(updated.roles).toEqual(['admin']) // unchanged
    })

    it('hashes new password on update', async () => {
      await writeUserYaml('user-1', sampleUserYaml)

      const updated = await provider.update('user-1', { password: 'newpassword' })

      expect(updated.passwordHash).toMatch(/^scrypt:/)
      expect(updated.passwordHash).not.toBe('scrypt:abc:def')
    })

    it('throws NotFoundError for nonexistent user', async () => {
      await expect(provider.update('ghost', { name: 'Nope' })).rejects.toThrow(NotFoundError)
    })

    it('persists update to disk', async () => {
      await writeUserYaml('user-1', sampleUserYaml)

      await provider.update('user-1', { name: 'Persisted' })

      const user = await provider.getById('user-1')
      expect(user.name).toBe('Persisted')
    })
  })

  describe('delete', () => {
    it('removes user file from disk', async () => {
      await writeUserYaml('user-1', sampleUserYaml)

      await provider.delete('user-1')

      const exists = await fsAdapter.exists(path.join(tmpDir, 'user-1.yaml'))
      expect(exists).toBe(false)
    })

    it('throws NotFoundError for nonexistent user', async () => {
      await expect(provider.delete('ghost')).rejects.toThrow(NotFoundError)
    })
  })
})

describe('YamlUserProviderFactory', () => {
  it('creates provider with configured usersPath', () => {
    const fsAdapter = new NodeFileSystemAdapter()
    const parser = new MarkdownYamlParser()
    const factory = new YamlUserProviderFactory(fsAdapter, parser)

    const provider = factory.create({ usersPath: '/custom/path' })

    expect(provider).toBeInstanceOf(YamlUserProvider)
  })

  it('defaults usersPath to ./users when not configured', () => {
    const fsAdapter = new NodeFileSystemAdapter()
    const parser = new MarkdownYamlParser()
    const factory = new YamlUserProviderFactory(fsAdapter, parser)

    const provider = factory.create({})

    expect(provider).toBeInstanceOf(YamlUserProvider)
  })
})
