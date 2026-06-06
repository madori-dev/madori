import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import { RuntimeSettingsService } from '@/lib/settings/runtime'

describe('RuntimeSettingsService', () => {
  let service: RuntimeSettingsService
  let tmpDir: string
  let settingsPath: string

  beforeEach(async () => {
    tmpDir = path.join(process.cwd(), 'tests', '.tmp', `settings-${Date.now()}`)
    await fs.mkdir(tmpDir, { recursive: true })
    settingsPath = path.join(tmpDir, 'settings.yaml')

    const adapter = new NodeFileSystemAdapter()
    const parser = new MarkdownYamlParser()
    service = new RuntimeSettingsService(adapter, parser, settingsPath)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('ensureExists', () => {
    it('creates settings.yaml with defaults when file does not exist', async () => {
      await service.ensureExists()

      const raw = await fs.readFile(settingsPath, 'utf-8')
      expect(raw).toContain('site_name: My Madori Site')
      expect(raw).toContain('locale: en-US')
      expect(raw).toContain('timezone: UTC')
    })

    it('does not overwrite existing settings.yaml', async () => {
      await fs.writeFile(settingsPath, 'site_name: Custom Site\nlocale: ja-JP\ntimezone: Asia/Tokyo\n')

      await service.ensureExists()

      const raw = await fs.readFile(settingsPath, 'utf-8')
      expect(raw).toContain('site_name: Custom Site')
      expect(raw).toContain('locale: ja-JP')
      expect(raw).toContain('timezone: Asia/Tokyo')
    })
  })

  describe('read', () => {
    it('returns defaults when file does not exist (auto-creates)', async () => {
      const settings = await service.read()

      expect(settings).toEqual({
        site_name: 'My Madori Site',
        locale: 'en-US',
        timezone: 'UTC',
      })
    })

    it('reads existing settings from YAML file', async () => {
      await fs.writeFile(settingsPath, 'site_name: Test Site\nlocale: fr-FR\ntimezone: Europe/Paris\n')

      const settings = await service.read()

      expect(settings).toEqual({
        site_name: 'Test Site',
        locale: 'fr-FR',
        timezone: 'Europe/Paris',
      })
    })

    it('fills in missing fields with defaults', async () => {
      await fs.writeFile(settingsPath, 'site_name: Partial\n')

      const settings = await service.read()

      expect(settings).toEqual({
        site_name: 'Partial',
        locale: 'en-US',
        timezone: 'UTC',
      })
    })
  })

  describe('write', () => {
    it('writes settings to YAML file', async () => {
      await service.write({
        site_name: 'Written Site',
        locale: 'de-DE',
        timezone: 'Europe/Berlin',
      })

      const raw = await fs.readFile(settingsPath, 'utf-8')
      expect(raw).toContain('site_name: Written Site')
      expect(raw).toContain('locale: de-DE')
      expect(raw).toContain('timezone: Europe/Berlin')
    })

    it('overwrites existing settings', async () => {
      await fs.writeFile(settingsPath, 'site_name: Old\nlocale: en-US\ntimezone: UTC\n')

      await service.write({
        site_name: 'New',
        locale: 'ja-JP',
        timezone: 'Asia/Tokyo',
      })

      const raw = await fs.readFile(settingsPath, 'utf-8')
      expect(raw).toContain('site_name: New')
      expect(raw).toContain('locale: ja-JP')
      expect(raw).toContain('timezone: Asia/Tokyo')
    })

    it('creates parent directories if they do not exist', async () => {
      const nestedPath = path.join(tmpDir, 'nested', 'dir', 'settings.yaml')
      const adapter = new NodeFileSystemAdapter()
      const parser = new MarkdownYamlParser()
      const nestedService = new RuntimeSettingsService(adapter, parser, nestedPath)

      await nestedService.write({
        site_name: 'Nested',
        locale: 'en-GB',
        timezone: 'Europe/London',
      })

      const raw = await fs.readFile(nestedPath, 'utf-8')
      expect(raw).toContain('site_name: Nested')
    })
  })
})
