import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { McpApiKey, McpPermission } from './auth'

const SCRYPT_SALT_LENGTH = 16
const SCRYPT_KEY_LENGTH = 64
const SCRYPT_COST = 16384
const SCRYPT_BLOCK_SIZE = 8
const SCRYPT_PARALLELIZATION = 1

function hashKey(rawKey: string, salt?: Buffer): { hash: string; salt: Buffer } {
  const s = salt ?? randomBytes(SCRYPT_SALT_LENGTH)
  const derived = scryptSync(rawKey, s, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
  })
  return {
    hash: `scrypt:${s.toString('base64url')}:${derived.toString('base64url')}`,
    salt: s,
  }
}

function verifyHash(rawKey: string, storedHash: string): boolean {
  const parts = storedHash.split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false

  const salt = Buffer.from(parts[1], 'base64url')
  const expectedDerived = Buffer.from(parts[2], 'base64url')

  const derived = scryptSync(rawKey, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
  })

  return timingSafeEqual(derived, expectedDerived)
}

function generateKeyId(): string {
  return randomBytes(12).toString('base64url')
}

function generateRawKey(): string {
  return `mdk_${randomBytes(48).toString('base64url')}`
}

export class McpApiKeyService {
  private readonly storagePath: string

  constructor(storagePath?: string) {
    this.storagePath = storagePath ?? join(process.cwd(), 'storage', 'ai', 'api-keys')
  }

  private ensureStorageDir(): void {
    if (!existsSync(this.storagePath)) {
      mkdirSync(this.storagePath, { recursive: true })
    }
  }

  private getKeyFilePath(id: string): string {
    return join(this.storagePath, `${id}.yaml`)
  }

  private readKeyFile(id: string): McpApiKey | null {
    const filePath = this.getKeyFilePath(id)
    if (!existsSync(filePath)) return null
    const content = readFileSync(filePath, 'utf-8')
    return parseYaml(content) as McpApiKey
  }

  private writeKeyFile(record: McpApiKey): void {
    this.ensureStorageDir()
    const filePath = this.getKeyFilePath(record.id)
    writeFileSync(filePath, stringifyYaml(record), 'utf-8')
  }

  async createKey(
    label: string,
    permissions: McpPermission[],
  ): Promise<{ key: string; record: McpApiKey }> {
    const id = generateKeyId()
    const rawKey = generateRawKey()
    const { hash } = hashKey(rawKey)

    const record: McpApiKey = {
      id,
      keyHash: hash,
      label,
      permissions,
      createdAt: new Date().toISOString(),
    }

    this.writeKeyFile(record)

    return { key: rawKey, record }
  }

  async validateKey(rawKey: string): Promise<McpApiKey | null> {
    this.ensureStorageDir()

    const files = readdirSync(this.storagePath).filter((f) => f.endsWith('.yaml'))

    for (const file of files) {
      const filePath = join(this.storagePath, file)
      const content = readFileSync(filePath, 'utf-8')
      const record = parseYaml(content) as McpApiKey

      if (verifyHash(rawKey, record.keyHash)) {
        return record
      }
    }

    return null
  }

  async revokeKey(id: string): Promise<void> {
    const record = this.readKeyFile(id)
    if (!record) {
      throw new Error(`API key not found: ${id}`)
    }

    record.revokedAt = new Date().toISOString()
    this.writeKeyFile(record)
  }

  async deleteKey(id: string): Promise<void> {
    const filePath = this.getKeyFilePath(id)
    if (!existsSync(filePath)) {
      throw new Error(`API key not found: ${id}`)
    }
    unlinkSync(filePath)
  }

  async listKeys(): Promise<McpApiKey[]> {
    this.ensureStorageDir()

    const files = readdirSync(this.storagePath).filter((f) => f.endsWith('.yaml'))
    const keys: McpApiKey[] = []

    for (const file of files) {
      const filePath = join(this.storagePath, file)
      const content = readFileSync(filePath, 'utf-8')
      keys.push(parseYaml(content) as McpApiKey)
    }

    return keys
  }

  async recordUsage(id: string): Promise<void> {
    const record = this.readKeyFile(id)
    if (!record) {
      throw new Error(`API key not found: ${id}`)
    }

    record.lastUsedAt = new Date().toISOString()
    this.writeKeyFile(record)
  }
}
