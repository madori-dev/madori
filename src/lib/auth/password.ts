import { randomBytes, scrypt, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const scryptAsync = promisify(scrypt)

const SALT_LENGTH = 32
const KEY_LENGTH = 64

/**
 * Hash a password using Node.js crypto.scrypt with a random salt.
 * Returns a formatted string: `scrypt:${salt}:${hash}` (hex-encoded).
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const hash = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`
}

/**
 * Verify a password against a stored hash string.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const parts = storedHash.split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false
  }

  const [, saltHex, hashHex] = parts
  const salt = Buffer.from(saltHex, 'hex')
  const expectedHash = Buffer.from(hashHex, 'hex')

  const derivedHash = (await scryptAsync(password, salt, expectedHash.length)) as Buffer

  return timingSafeEqual(derivedHash, expectedHash)
}
