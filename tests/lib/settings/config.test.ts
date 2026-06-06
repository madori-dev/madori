import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {
  MadoriConfigService,
  deepMerge,
  rewriteConfigFile,
  serializeConfigObject,
} from '@/lib/settings/config'

describe('MadoriConfigService', () => {
  let tmpDir: string
  let configPath: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-config-test-'))
    configPath = path.join(tmpDir, 'madori.config.ts')
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('validate()', () => {
    it('accepts non-empty path values', async () => {
      const service = new MadoriConfigService(configPath)
      const result = await service.validate({
        contentPath: './content',
        resourcesPath: './resources',
        usersPath: './users',
        assetsPath: './public/assets',
      })
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('rejects empty contentPath', async () => {
      const service = new MadoriConfigService(configPath)
      const result = await service.validate({ contentPath: '' })
      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].field).toBe('contentPath')
    })

    it('rejects whitespace-only resourcesPath', async () => {
      const service = new MadoriConfigService(configPath)
      const result = await service.validate({ resourcesPath: '   ' })
      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].field).toBe('resourcesPath')
    })

    it('rejects whitespace-only usersPath', async () => {
      const service = new MadoriConfigService(configPath)
      const result = await service.validate({ usersPath: '\t\n' })
      expect(result.valid).toBe(false)
      expect(result.errors[0].field).toBe('usersPath')
    })

    it('rejects empty assetsPath', async () => {
      const service = new MadoriConfigService(configPath)
      const result = await service.validate({ assetsPath: '' })
      expect(result.valid).toBe(false)
      expect(result.errors[0].field).toBe('assetsPath')
    })

    it('reports multiple errors for multiple empty paths', async () => {
      const service = new MadoriConfigService(configPath)
      const result = await service.validate({
        contentPath: '',
        resourcesPath: '  ',
        usersPath: '',
        assetsPath: '\t',
      })
      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(4)
    })

    it('ignores non-path fields in validation', async () => {
      const service = new MadoriConfigService(configPath)
      const result = await service.validate({
        cp: { enabled: true, path: '/cp' },
        graphql: { enabled: false },
      })
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('rewriteConfigFile()', () => {
    it('preserves import statement and export default pattern', () => {
      const original = `import type { MadoriConfigInput } from './src/lib/config/schema'

const config: MadoriConfigInput & { collections?: Record<string, unknown> } = {
  contentPath: './content',
  resourcesPath: './resources',
  usersPath: './users',
  assetsPath: './public/assets',

  cp: {
    enabled: true,
    path: '/cp',
  },
}

export default config
`
      const newConfig = {
        contentPath: './new-content',
        resourcesPath: './resources',
        usersPath: './users',
        assetsPath: './public/assets',
        cp: { enabled: true, path: '/cp' },
        graphql: { enabled: true, path: '/api/graphql', introspection: false },
        auth: { driver: 'password', store: 'file', provider: 'yaml' },
        staticCache: {
          enabled: false,
          driver: 'application' as const,
          storagePath: 'storage/static-cache/',
          exclude: [],
          queryStrings: 'ignore' as const,
          warmOnInvalidate: false,
          invalidationRules: [],
        },
      }

      const result = rewriteConfigFile(original, newConfig)

      expect(result).toContain("import type { MadoriConfigInput }")
      expect(result).toContain('export default config')
      expect(result).toContain("contentPath: './new-content'")
      expect(result).toContain('const config:')
    })

    it('handles inline export default', () => {
      const original = `export default {
  contentPath: './content',
}
`
      const newConfig = {
        contentPath: './updated',
        resourcesPath: './resources',
        usersPath: './users',
        assetsPath: './public/assets',
        cp: { enabled: true, path: '/cp' },
        graphql: { enabled: true, path: '/api/graphql', introspection: false },
        auth: { driver: 'password', store: 'file', provider: 'yaml' },
        staticCache: {
          enabled: false,
          driver: 'application' as const,
          storagePath: 'storage/static-cache/',
          exclude: [],
          queryStrings: 'ignore' as const,
          warmOnInvalidate: false,
          invalidationRules: [],
        },
      }

      const result = rewriteConfigFile(original, newConfig)

      expect(result).toContain('export default {')
      expect(result).toContain("contentPath: './updated'")
      expect(result).not.toContain('const config')
    })
  })

  describe('serializeConfigObject()', () => {
    it('serializes simple key-value pairs', () => {
      const result = serializeConfigObject(
        { contentPath: './content', usersPath: './users' },
        '  '
      )
      expect(result).toContain("contentPath: './content'")
      expect(result).toContain("usersPath: './users'")
    })

    it('serializes nested objects', () => {
      const result = serializeConfigObject(
        { cp: { enabled: true, path: '/cp' } },
        '  '
      )
      expect(result).toContain('cp: {')
      expect(result).toContain('enabled: true')
      expect(result).toContain("path: '/cp'")
    })

    it('serializes arrays', () => {
      const result = serializeConfigObject(
        { exclude: ['/admin', '/api'] },
        '  '
      )
      expect(result).toContain("exclude: ['/admin', '/api']")
    })

    it('skips undefined values', () => {
      const result = serializeConfigObject(
        { contentPath: './content', optional: undefined },
        '  '
      )
      expect(result).not.toContain('optional')
    })
  })

  describe('deepMerge()', () => {
    it('merges top-level properties', () => {
      const target = { a: 1, b: 2 }
      const source = { b: 3, c: 4 }
      const result = deepMerge(target, source)
      expect(result).toEqual({ a: 1, b: 3, c: 4 })
    })

    it('merges nested objects recursively', () => {
      const target = { cp: { enabled: true, path: '/cp' } }
      const source = { cp: { path: '/admin' } }
      const result = deepMerge(target, source as typeof target)
      expect(result).toEqual({ cp: { enabled: true, path: '/admin' } })
    })

    it('replaces arrays entirely (no recursive merge)', () => {
      const target = { exclude: ['/a', '/b'] }
      const source = { exclude: ['/c'] }
      const result = deepMerge(target, source)
      expect(result).toEqual({ exclude: ['/c'] })
    })

    it('skips undefined source values', () => {
      const target = { a: 1, b: 2 }
      const source = { a: undefined }
      const result = deepMerge(target, source as Partial<typeof target>)
      expect(result).toEqual({ a: 1, b: 2 })
    })
  })
})
