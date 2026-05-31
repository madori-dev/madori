import { describe, it, expect, afterEach } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { NodeFileSystemAdapter } from '../../../src/lib/fs/adapter'
import { MarkdownYamlParser } from '../../../src/lib/fs/parser'
import { YamlUserProvider } from '../../../src/lib/auth/providers/yaml'

/**
 * Property tests for user creation round-trip and password security.
 * Validates: Requirements 4.8, 5.1, 5.2, 5.3, 8.1, 8.2, 8.3, 9.3
 */

// Generators for valid user input
const validUserId = fc.stringMatching(/^[a-z0-9][a-z0-9-]*$/, { minLength: 1, maxLength: 30 })
const validEmail = fc
  .tuple(
    fc.stringMatching(/^[a-z0-9]+$/, { minLength: 1, maxLength: 10 }),
    fc.stringMatching(/^[a-z0-9]+$/, { minLength: 1, maxLength: 10 }),
    fc.stringMatching(/^[a-z]{2,4}$/)
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`)
const validName = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0)
const validPassword = fc.string({ minLength: 8, maxLength: 64 }).filter((s) => s.length >= 8)
const validRoles = fc
  .subarray(['admin', 'editor'] as const, { minLength: 1 })
  .map((arr) => [...arr])

const validUserInput = fc.record({
  id: validUserId,
  email: validEmail,
  name: validName,
  password: validPassword,
  roles: validRoles,
})

// Track temp dirs for cleanup
const tempDirs: string[] = []

async function createTempUsersDir(): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-test-users-'))
  tempDirs.push(tmpDir)
  return tmpDir
}

afterEach(async () => {
  for (const dir of tempDirs) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
  tempDirs.length = 0
})

describe('Property 1: User creation round-trip', () => {
  /**
   * **Validates: Requirements 4.8, 8.1, 8.2, 8.3, 9.3**
   * For any valid user input, creating a user via YamlUserProvider produces a YAML file
   * at users/<id>.yaml containing all required fields (id, email, name, roles,
   * password_hash, created_at) where created_at is a valid ISO 8601 timestamp.
   */

  it('valid input produces YAML with all required fields and valid ISO 8601 timestamp', async () => {
    await fc.assert(
      fc.asyncProperty(validUserInput, async (input) => {
        const usersPath = await createTempUsersDir()
        const fsAdapter = new NodeFileSystemAdapter()
        const parser = new MarkdownYamlParser()
        const store = new YamlUserProvider(usersPath, fsAdapter, parser)

        await store.create(input)

        // Read back the raw YAML file
        const filePath = path.join(usersPath, `${input.id}.yaml`)
        const rawContent = await fs.readFile(filePath, 'utf-8')
        const parsed = parser.parseYaml<Record<string, unknown>>(rawContent)

        // Verify all required fields exist
        expect(parsed).toHaveProperty('id', input.id)
        expect(parsed).toHaveProperty('email', input.email)
        expect(parsed).toHaveProperty('name', input.name)
        expect(parsed).toHaveProperty('roles')
        expect(parsed.roles).toEqual(input.roles)
        expect(parsed).toHaveProperty('password_hash')
        expect(parsed).toHaveProperty('created_at')

        // Verify created_at is a valid ISO 8601 timestamp
        const createdAt = parsed.created_at as string
        const date = new Date(createdAt)
        expect(date.toISOString()).toBe(createdAt)
        expect(Number.isNaN(date.getTime())).toBe(false)
      }),
      { numRuns: 20 }
    )
  })
})

describe('Property 2: Password security', () => {
  /**
   * **Validates: Requirements 5.1, 5.2, 5.3**
   * For any password string provided during user creation, the resulting YAML file
   * contains a password_hash field matching the format scrypt:<hex>:<hex> and does
   * NOT contain the plaintext password anywhere in the file content.
   */

  it('output YAML contains scrypt:<hex>:<hex> hash, never plaintext password', async () => {
    await fc.assert(
      fc.asyncProperty(validUserInput, async (input) => {
        const usersPath = await createTempUsersDir()
        const fsAdapter = new NodeFileSystemAdapter()
        const parser = new MarkdownYamlParser()
        const store = new YamlUserProvider(usersPath, fsAdapter, parser)

        await store.create(input)

        // Read back the raw file content
        const filePath = path.join(usersPath, `${input.id}.yaml`)
        const rawContent = await fs.readFile(filePath, 'utf-8')

        // Verify password_hash matches scrypt:<hex>:<hex> format
        const parsed = parser.parseYaml<Record<string, unknown>>(rawContent)
        const passwordHash = parsed.password_hash as string
        const scryptPattern = /^scrypt:[0-9a-f]+:[0-9a-f]+$/
        expect(passwordHash).toMatch(scryptPattern)

        // Verify plaintext password does NOT appear in the file
        // Only check if password is long enough to be meaningful (avoid false positives
        // with very short substrings that might appear in hex)
        if (input.password.length >= 8) {
          expect(rawContent).not.toContain(input.password)
        }
      }),
      { numRuns: 20 }
    )
  })
})
