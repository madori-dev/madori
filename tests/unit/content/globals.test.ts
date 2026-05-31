import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import { InMemoryContentCache } from '@/lib/cache/store'
import { GlobalOperations } from '@/lib/content/globals'

describe('GlobalOperations', () => {
  let globals: GlobalOperations
  let cache: InMemoryContentCache
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = path.join(process.cwd(), 'tests', '.tmp', `globals-${Date.now()}`)
    const globalsDir = path.join(tmpDir, 'globals')
    await fs.mkdir(globalsDir, { recursive: true })

    const adapter = new NodeFileSystemAdapter()
    const parser = new MarkdownYamlParser()
    cache = new InMemoryContentCache()
    globals = new GlobalOperations(adapter, parser, cache, tmpDir)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('getGlobal', () => {
    it('returns null for non-existent global', async () => {
      const result = await globals.getGlobal('nonexistent')
      expect(result).toBeNull()
    })

    it('reads and parses a global YAML file', async () => {
      const yaml = `site_name: My Website\ntagline: Built with MADORI\n`
      await fs.writeFile(path.join(tmpDir, 'globals', 'site.yaml'), yaml)

      const result = await globals.getGlobal('site')
      expect(result).not.toBeNull()
      expect(result!.handle).toBe('site')
      expect(result!.data.site_name).toBe('My Website')
      expect(result!.data.tagline).toBe('Built with MADORI')
    })

    it('extracts title from data if present', async () => {
      const yaml = `title: Site Settings\nfoo: bar\n`
      await fs.writeFile(path.join(tmpDir, 'globals', 'settings.yaml'), yaml)

      const result = await globals.getGlobal('settings')
      expect(result!.title).toBe('Site Settings')
    })

    it('returns cached result on second call', async () => {
      const yaml = `key: value\n`
      await fs.writeFile(path.join(tmpDir, 'globals', 'cached.yaml'), yaml)

      const first = await globals.getGlobal('cached')
      // Modify file on disk
      await fs.writeFile(path.join(tmpDir, 'globals', 'cached.yaml'), `key: changed\n`)
      const second = await globals.getGlobal('cached')

      // Should return cached version
      expect(second).toEqual(first)
    })
  })

  describe('listGlobals', () => {
    it('returns empty array when no globals exist', async () => {
      const result = await globals.listGlobals()
      expect(result).toEqual([])
    })

    it('lists all global YAML files', async () => {
      await fs.writeFile(path.join(tmpDir, 'globals', 'site.yaml'), `site_name: Test\n`)
      await fs.writeFile(path.join(tmpDir, 'globals', 'footer.yaml'), `copyright: 2024\n`)

      const result = await globals.listGlobals()
      expect(result).toHaveLength(2)
      const handles = result.map((g) => g.handle).sort()
      expect(handles).toEqual(['footer', 'site'])
    })
  })

  describe('updateGlobal', () => {
    it('writes global data to YAML file', async () => {
      const data = { site_name: 'Updated Site', tagline: 'New tagline' }
      const result = await globals.updateGlobal('site', data)

      expect(result.handle).toBe('site')
      expect(result.data).toEqual(data)

      // Verify file was written
      const raw = await fs.readFile(path.join(tmpDir, 'globals', 'site.yaml'), 'utf-8')
      expect(raw).toContain('site_name: Updated Site')
      expect(raw).toContain('tagline: New tagline')
    })

    it('overwrites existing global', async () => {
      await fs.writeFile(path.join(tmpDir, 'globals', 'site.yaml'), `old_key: old_value\n`)

      const data = { new_key: 'new_value' }
      await globals.updateGlobal('site', data)

      const raw = await fs.readFile(path.join(tmpDir, 'globals', 'site.yaml'), 'utf-8')
      expect(raw).toContain('new_key: new_value')
      expect(raw).not.toContain('old_key')
    })

    it('invalidates cache after update', async () => {
      await fs.writeFile(path.join(tmpDir, 'globals', 'site.yaml'), `key: original\n`)

      // Populate cache
      await globals.getGlobal('site')

      // Update
      await globals.updateGlobal('site', { key: 'updated' })

      // Should return new value
      const result = await globals.getGlobal('site')
      expect(result!.data.key).toBe('updated')
    })
  })
})
