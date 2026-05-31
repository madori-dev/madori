import type { UserProvider, UserProviderFactory } from '../contracts/user-provider'
import type { User, CreateUserInput, UpdateUserInput } from '../types'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'
import { NotFoundError, ConflictError } from '@/lib/errors'
import { hashPassword } from '../password'
import * as path from 'path'

/** YAML representation stored on disk (snake_case keys) */
interface UserYaml {
  id: string
  email: string
  name: string
  roles: string[]
  password_hash: string
  created_at: string
  last_login?: string
}

function userFromYaml(yaml: UserYaml): User {
  return {
    id: yaml.id,
    email: yaml.email,
    name: yaml.name,
    roles: yaml.roles ?? [],
    passwordHash: yaml.password_hash,
    createdAt: yaml.created_at,
    lastLogin: yaml.last_login,
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
  return yaml
}

export class YamlUserProvider implements UserProvider {
  constructor(
    private readonly usersPath: string,
    private readonly fs: FileSystemAdapter,
    private readonly parser: ContentParser
  ) {}

  private userFilePath(id: string): string {
    return path.join(this.usersPath, `${id}.yaml`)
  }

  async getById(id: string): Promise<User> {
    const filePath = this.userFilePath(id)
    const exists = await this.fs.exists(filePath)
    if (!exists) {
      throw new NotFoundError('User', id)
    }
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
    const files = await this.fs.listFiles(this.usersPath, '*.yaml')
    const users: User[] = []
    for (const file of files) {
      const filePath = path.join(this.usersPath, file)
      const raw = await this.fs.readFile(filePath)
      const yaml = this.parser.parseYaml<UserYaml>(raw)
      users.push(userFromYaml(yaml))
    }
    return users
  }

  async create(input: CreateUserInput): Promise<User> {
    const filePath = this.userFilePath(input.id)
    const exists = await this.fs.exists(filePath)
    if (exists) {
      throw new ConflictError(`User with id "${input.id}" already exists`)
    }

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
    await this.fs.writeFile(filePath, content)
    return user
  }

  async update(id: string, input: UpdateUserInput): Promise<User> {
    const user = await this.getById(id)

    if (input.email !== undefined) user.email = input.email
    if (input.name !== undefined) user.name = input.name
    if (input.roles !== undefined) user.roles = input.roles
    if (input.lastLogin !== undefined) user.lastLogin = input.lastLogin
    if (input.password !== undefined) {
      user.passwordHash = await hashPassword(input.password)
    }

    const yaml = userToYaml(user)
    const content = this.parser.serializeYaml(yaml)
    await this.fs.writeFile(this.userFilePath(id), content)
    return user
  }

  async delete(id: string): Promise<void> {
    const filePath = this.userFilePath(id)
    const exists = await this.fs.exists(filePath)
    if (!exists) {
      throw new NotFoundError('User', id)
    }
    await this.fs.deleteFile(filePath)
  }
}

export class YamlUserProviderFactory implements UserProviderFactory {
  constructor(
    private readonly fs: FileSystemAdapter,
    private readonly parser: ContentParser
  ) {}

  create(config: Record<string, unknown>): YamlUserProvider {
    const usersPath = (config.usersPath as string) ?? './users'
    return new YamlUserProvider(usersPath, this.fs, this.parser)
  }
}
