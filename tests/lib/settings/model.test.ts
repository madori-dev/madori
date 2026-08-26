import { describe, expect, it } from 'vitest'

import { MadoriConfigSchema } from '@/lib/config/schema'
import {
  normalizeSettingsLines,
  parseSettingsConfigEdit,
  projectSettingsConfig,
  updateSettingsConfig,
  validateSettingsPaths,
  validationErrorsByPath,
} from '@/lib/settings/model'

function configFixture() {
  return MadoriConfigSchema.parse({
    auth: {
      driver: 'password',
      store: 'file',
      provider: 'yaml',
      driverConfig: { clientSecret: 'do-not-expose' },
      storeConfig: { password: 'do-not-expose' },
    },
  })
}

describe('Settings model interface', () => {
  it('projects only browser-safe auth selections', () => {
    const projected = projectSettingsConfig(configFixture())

    expect(projected.auth).toEqual({
      driver: 'password',
      store: 'file',
      provider: 'yaml',
    })
    expect(projected.auth).not.toHaveProperty('driverConfig')
    expect(projected.auth).not.toHaveProperty('storeConfig')
  })

  it('accepts only fields exposed by browser-safe model', () => {
    const edit = parseSettingsConfigEdit({
      contentPath: './new-content',
      privateSetting: 'remove-me',
      auth: {
        driver: 'password',
        store: 'database',
        provider: 'users',
        storeConfig: { password: 'remove-me' },
      },
    })

    expect(edit).toEqual({
      contentPath: './new-content',
      auth: { driver: 'password', store: 'database', provider: 'users' },
    })
  })

  it('preserves partial nested edit semantics without injecting defaults', () => {
    expect(parseSettingsConfigEdit({
      graphql: { enabled: false },
      auth: { driver: 'oauth' },
    })).toEqual({
      graphql: { enabled: false },
      auth: { driver: 'oauth' },
    })
  })

  it('updates dotted paths immutably through one edit interface', () => {
    const original = projectSettingsConfig(configFixture())
    const updated = updateSettingsConfig(original, 'staticCache.storagePath', './cache')

    expect(updated.staticCache.storagePath).toBe('./cache')
    expect(original.staticCache.storagePath).toBe('storage/static-cache/')
    expect(updated.staticCache).not.toBe(original.staticCache)
    expect(updated.auth).toBe(original.auth)
  })

  it('normalizes line-oriented controls', () => {
    expect(normalizeSettingsLines(' /cp/** \n\n/api/**\n /cp/** ')).toEqual([
      '/cp/**',
      '/api/**',
      '/cp/**',
    ])
  })

  it('shares path validation and browser error labels', () => {
    const result = validateSettingsPaths({
      contentPath: ' ',
      staticCache: { storagePath: '' },
    })

    expect(result.valid).toBe(false)
    expect(validationErrorsByPath(result)).toEqual({
      contentPath: 'Content Path cannot be empty',
      'staticCache.storagePath': 'Storage Path cannot be empty',
    })
  })
})
