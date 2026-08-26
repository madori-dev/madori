import { randomUUID } from 'crypto'
import { input, password, checkbox } from '@inquirer/prompts'
import { validatePasswordPolicy } from '../../../../src/lib/auth/password-policy.js'

export interface UserPromptResult {
  id: string
  email: string
  name: string
  password: string
  roles: string[]
}

export function validateEmail(value: string): string | true {
  if (!value.trim()) return 'Email cannot be empty'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return 'Invalid email format'
  }
  return true
}

export function validatePassword(value: string): string | true {
  const result = validatePasswordPolicy(value)
  return result.valid ? true : result.message
}

export async function promptForUserDetails(): Promise<UserPromptResult> {
  const id = randomUUID()

  const email = await input({
    message: 'Email:',
    validate: validateEmail,
  })

  const name = await input({
    message: 'Display name:',
    validate: (value) => value.trim().length > 0 || 'Name cannot be empty',
  })

  const pwd = await password({
    message: 'Password:',
    mask: '*',
    validate: validatePassword,
  })

  await password({
    message: 'Confirm password:',
    mask: '*',
    validate: (value) => value === pwd || 'Passwords do not match',
  })

  const roles = await checkbox({
    message: 'Roles:',
    choices: [
      { name: 'admin', value: 'admin' },
      { name: 'editor', value: 'editor' },
    ],
    validate: (value) => value.length > 0 || 'At least one role must be selected',
  })

  return { id, email, name, password: pwd, roles }
}
