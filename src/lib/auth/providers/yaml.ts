import type { UserProvider, UserProviderFactory } from '../contracts/user-provider'
import type { User, CreateUserInput, UpdateUserInput } from '../types'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'
import { NotFoundError, ConflictError } from '@/lib/errors'
import { hashPassword } from '../password'
import { assertPasswordPolicy } from '../password-policy'
import * as path from 'path'
import { AtomicFileWriter } from '@/lib/fs/atomic-writer'
import type { ContentMutationReporter } from '@/lib/mutations'
import { noOpContentMutationReporter } from '@/lib/mutations'

/** User ids become filenames; keep them to one safe path component. */
export function assertSafeUserId(id: string): void {
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) {
    throw new Error('User id must contain only letters, numbers, underscores, and hyphens')
  }
}

/** YAML representation stored on disk (snake_case keys) */
interface UserYaml {
  id: string
  email: string
  name: string
  roles: string[]
  password_hash: string
  created_at: string
  last_login?: string
  theme?: 'light' | 'dark'
}

function userFromYaml(yaml: UserYaml): User {
  assertSafeUserId(yaml.id)
  return {
    id: yaml.id,
    email: yaml.email,
    name: yaml.name,
    roles: yaml.roles ?? [],
    passwordHash: yaml.password_hash,
    createdAt: yaml.created_at,
    lastLogin: yaml.last_login,
    theme: yaml.theme,
  }
}

function userToYaml(user: User): UserYaml {
  const yaml: UserYaml = {
    id: user.id,
    email: user.email,
    name: user.name,
    roles: user.roles,
    password_hash: user.passwordHash,
    created_at: user.createdAt,
  }
  if (user.lastLogin) {
    yaml.last_login = user.lastLogin
  }
  if (user.theme) {
    yaml.theme = user.theme
  }
  return yaml
}

export class YamlUserProvider implements UserProvider {
  private readonly atomicWriter: AtomicFileWriter

  constructor(
    private readonly usersPath: string,
    private readonly fs: FileSystemAdapter,
    private readonly parser: ContentParser,
    private readonly mutations: ContentMutationReporter = noOpContentMutationReporter
  ) {
    this.atomicWriter = new AtomicFileWriter(fs)
  }

  private userFilePath(id: string): string {
    assertSafeUserId(id)
    return path.join(this.usersPath, `${id}.yaml`)
  }

  async getById(id: string): Promise<User> {
    const filePath = this.userFilePath(id)
    const exists = await this.fs.exists(filePath)
    if (!exists) {
      throw new NotFoundError('User', id)
    }
    await this.restrictPath(filePath)
    const raw = await this.fs.readFile(filePath)
    const yaml = this.parser.parseYaml<UserYaml>(raw)
    return userFromYaml(yaml)
  }

  async getByEmail(email: string): Promise<User | null> {
    const users = await this.list()
    return users.find((u) => u.email === email) ?? null
  }

  async list(): Promise<User[]> {
    const dirExists = await this.fs.exists(this.usersPath)
    if (!dirExists) return []
    await this.restrictPath(this.usersPath, 0o700)
    const files = await this.fs.listFiles(this.usersPath, '*.yaml')
    const users: User[] = []
    for (const file of files) {
      const filePath = path.join(this.usersPath, file)
      await this.restrictPath(filePath)
      const raw = await this.fs.readFile(filePath)
      const yaml = this.parser.parseYaml<UserYaml>(raw)
      users.push(userFromYaml(yaml))
    }
    return users
  }

  async create(input: CreateUserInput): Promise<User> {
    assertSafeUserId(input.id)
    const filePath = this.userFilePath(input.id)
    const exists = await this.fs.exists(filePath)
    if (exists) {
      throw new ConflictError(`User with id "${input.id}" already exists`)
    }
    assertPasswordPolicy(input.password)

    const passwordHash = await hashPassword(input.password)
    const user: User = {
      id: input.id,
      email: input.email,
      name: input.name,
      roles: input.roles,
      passwordHash,
      createdAt: new Date().toISOString(),
    }

    const yaml = userToYaml(user)
    const content = this.parser.serializeYaml(yaml)
    await this.writeUserAtomic(filePath, content)
    this.report('create', filePath, input.id)
    return user
  }

  async update(id: string, input: UpdateUserInput): Promise<User> {
    assertSafeUserId(id)
    const user = await this.getById(id)

    if (input.email !== undefined) user.email = input.email
    if (input.name !== undefined) user.name = input.name
    if (input.roles !== undefined) user.roles = input.roles
    if (input.lastLogin !== undefined) user.lastLogin = input.lastLogin
    if (input.theme !== undefined) user.theme = input.theme
    if (input.password !== undefined) {
      assertPasswordPolicy(input.password)
      user.passwordHash = await hashPassword(input.password)
    }

    const yaml = userToYaml(user)
    const content = this.parser.serializeYaml(yaml)
    await this.writeUserAtomic(this.userFilePath(id), content)
    this.report('update', this.userFilePath(id), id)
    return user
  }

  async delete(id: string): Promise<void> {
    assertSafeUserId(id)
    const filePath = this.userFilePath(id)
    const exists = await this.fs.exists(filePath)
    if (!exists) {
      throw new NotFoundError('User', id)
    }
    await this.fs.deleteFile(filePath)
    this.report('delete', filePath, id)
  }

  private async writeUserAtomic(filePath: string, content: string): Promise<void> {
    await this.fs.mkdir(this.usersPath)
    await this.restrictPath(this.usersPath, 0o700)
    const result = await this.atomicWriter.writeFileAtomic(filePath, content, { mode: 0o600 })
    if (!result.success) throw result.error ?? new Error(`Could not write user: ${filePath}`)
  }

  private async restrictPath(filePath: string, mode = 0o600): Promise<void> {
    if (this.fs.chmod) await this.fs.chmod(filePath, mode)
  }

  private report(action: 'create' | 'update' | 'delete', filePath: string, id: string): void {
    this.mutations.report({ action, paths: [path.resolve(filePath)], resource: { type: 'user', id }, message: `${action[0].toUpperCase()}${action.slice(1)}d user ${id}`, source: 'system', timestamp: Date.now() })
  }
}

export class YamlUserProviderFactory implements UserProviderFactory {
  constructor(
    private readonly fs: FileSystemAdapter,
    private readonly parser: ContentParser,
    private readonly mutations: ContentMutationReporter = noOpContentMutationReporter
  ) {}

  create(config: Record<string, unknown>): YamlUserProvider {
    const usersPath = (config.usersPath as string) ?? './users'
    return new YamlUserProvider(usersPath, this.fs, this.parser, this.mutations)
  }
}
