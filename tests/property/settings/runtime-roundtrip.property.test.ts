// Property 4: Runtime settings write/read round-trip

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { RuntimeSettingsService } from '@/lib/settings/runtime'
import type { RuntimeSettings } from '@/lib/settings/runtime'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'

/**
 * Validates: Requirements 2.2
 *
 * Property: For any valid RuntimeSettings object (non-empty site_name, locale
 * from the supported set, timezone from the IANA set), writing it to the runtime
 * settings YAML file and reading it back produces an object with identical values.
 */

// --- In-memory FileSystemAdapter ---

function createInMemoryFs(): FileSystemAdapter {
  const store = new Map<string, string>()
  return {
    async readFile(path: string) {
      const content = store.get(path)
      if (content === undefined) throw new Error(`File not found: ${path}`)
      return content
    },
    async writeFile(path: string, content: string) {
      store.set(path, content)
    },
    async exists(path: string) {
      return store.has(path)
    },
    async deleteFile(path: string) {
      store.delete(path)
    },
    async listFiles() {
      return []
    },
    async listDirectories() {
      return []
    },
    async mkdir() {},
    async copyFile() {},
    async moveFile() {},
  }
}

// --- Generators ---

/** Non-empty site name: printable characters, at least 1 char */
const siteNameArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0)

/** Standard locale codes */
const localeArb = fc.constantFrom(
  'en-US',
  'en-GB',
  'fr-FR',
  'de-DE',
  'es-ES',
  'it-IT',
  'pt-BR',
  'ja-JP',
  'ko-KR',
  'zh-CN',
  'zh-TW',
  'ru-RU',
  'ar-SA',
  'hi-IN',
  'nl-NL',
  'sv-SE',
  'pl-PL',
  'tr-TR',
)

/** IANA timezone identifiers */
const timezoneArb = fc.constantFrom(
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Africa/Cairo',
  'Africa/Nairobi',
)

/** Generator for valid RuntimeSettings objects */
const runtimeSettingsArb: fc.Arbitrary<RuntimeSettings> = fc.record({
  site_name: siteNameArb,
  locale: localeArb,
  timezone: timezoneArb,
})

// --- Property Tests ---

describe('Property 4: Runtime settings write/read round-trip', () => {
  it('writing then reading RuntimeSettings produces identical values', async () => {
    await fc.assert(
      fc.asyncProperty(runtimeSettingsArb, async (settings) => {
        const fs = createInMemoryFs()
        const parser = new MarkdownYamlParser()
        const settingsPath = 'content/settings.yaml'
        const service = new RuntimeSettingsService(fs, parser, settingsPath)

        await service.write(settings)
        const result = await service.read()

        expect(result).toEqual(settings)
      }),
      { numRuns: 100 },
    )
  })
})
