import * as path from 'path'

export function resolveProjectPath(...segments: string[]): string {
  return path.resolve(process.cwd(), ...segments)
}

export function resolveUsersPath(): string {
  return resolveProjectPath('users')
}
