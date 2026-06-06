export interface Session {
  id: string
  userId: string
  token: string
  expiresAt: string
}

export interface User {
  id: string
  email: string
  name: string
  roles: string[]
  passwordHash: string
  createdAt: string
  lastLogin?: string
  theme?: 'light' | 'dark'
}

export interface CreateUserInput {
  id: string
  email: string
  name: string
  password: string
  roles: string[]
}

export interface UpdateUserInput {
  email?: string
  name?: string
  password?: string
  roles?: string[]
  lastLogin?: string
  theme?: 'light' | 'dark'
}
