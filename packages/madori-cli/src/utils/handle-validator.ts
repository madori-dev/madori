export interface HandleValidationResult {
  valid: boolean
  error?: string
}

const RESERVED_NAMES = [
  'admin',
  'system',
  'config',
  'api',
  'auth',
  'login',
  'logout',
  'register',
  'settings',
  'dashboard',
  'null',
  'undefined',
  'true',
  'false',
] as const

const MAX_LENGTH = 64
const HANDLE_PATTERN = /^[a-z][a-z0-9_-]*$/

export function validateHandle(handle: string): HandleValidationResult {
  if (!handle) {
    return { valid: false, error: 'Handle must not be empty' }
  }

  if (handle.length > MAX_LENGTH) {
    return { valid: false, error: `Handle must not exceed ${MAX_LENGTH} characters` }
  }

  if (!/^[a-z]/.test(handle)) {
    return { valid: false, error: 'Handle must start with a lowercase letter' }
  }

  if (!HANDLE_PATTERN.test(handle)) {
    return {
      valid: false,
      error: 'Handle must contain only lowercase alphanumeric characters, hyphens, and underscores',
    }
  }

  if (RESERVED_NAMES.includes(handle as (typeof RESERVED_NAMES)[number])) {
    return { valid: false, error: `Handle "${handle}" is a reserved name` }
  }

  return { valid: true }
}
