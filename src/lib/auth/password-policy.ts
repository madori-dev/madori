export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 128

export type PasswordPolicyResult =
  | { valid: true }
  | { valid: false; message: string }

/**
 * Shared password acceptance policy for every account mutation seam.
 * Length follows JavaScript and HTML input semantics so browser and server agree.
 */
export function validatePasswordPolicy(password: unknown): PasswordPolicyResult {
  if (typeof password !== 'string') {
    return { valid: false, message: 'Password must be a string' }
  }

  const length = password.length
  if (length < PASSWORD_MIN_LENGTH) {
    return { valid: false, message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` }
  }
  if (length > PASSWORD_MAX_LENGTH) {
    return { valid: false, message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters` }
  }

  return { valid: true }
}

export function assertPasswordPolicy(password: unknown): asserts password is string {
  const result = validatePasswordPolicy(password)
  if (!result.valid) throw new Error(result.message)
}
