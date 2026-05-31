import type { User, CreateUserInput, UpdateUserInput } from '../types'

export interface UserProvider {
  getById(id: string): Promise<User>
  getByEmail(email: string): Promise<User | null>
  list(): Promise<User[]>
  create(input: CreateUserInput): Promise<User>
  update(id: string, input: UpdateUserInput): Promise<User>
  delete(id: string): Promise<void>
}

export interface UserProviderFactory {
  create(config: Record<string, unknown>): UserProvider
}
