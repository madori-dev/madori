import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import { InMemoryContentCache } from '@/lib/cache/store'
import { NavigationOperations } from '@/lib/content/navigation'

describe('NavigationOperations', () => {
  let navigation: NavigationOperations
  let cache: InMemoryContentCache
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = path.join(process.cwd(), 'tests', '.tmp', `nav-${Date.now()}`)
    const navDir = path.join(tmpDir, 'navigation')
    await fs.mkdir(navDir, { recursive: true })

    const adapter = new NodeFileSystemAdapter()
    const parser = new MarkdownYamlParser()
    cache = new InMemoryContentCache()
    navigation = new NavigationOperations(adapter, parser, cache, tmpDir)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('getNavigation', () => {
    it('returns null for non-existent navigation', async () => {
      const result = await navigation.getNavigation('nonexistent')
      expect(result).toBeNull()
    })

    it('reads and parses a navigation YAML file', async () => {
      const yaml = `items:
  - label: Home
    url: /
  - label: Blog
    url: /blog
`
      await fs.writeFile(path.join(tmpDir, 'navigation', 'main.yaml'), yaml)

      const result = await navigation.getNavigation('main')
      expect(result).not.toBeNull()
      expect(result!.handle).toBe('main')
      expect(result!.items).toHaveLength(2)
      expect(result!.items[0]).toEqual({ label: 'Home', url: '/' })
      expect(result!.items[1]).toEqual({ label: 'Blog', url: '/blog' })
    })

    it('parses nested children', async () => {
      const yaml = `items:
  - label: About
    children:
      - label: Team
        url: /about/team
      - label: Contact
        url: /contact
`
      await fs.writeFile(path.join(tmpDir, 'navigation', 'main.yaml'), yaml)

      const result = await navigation.getNavigation('main')
      expect(result!.items[0].label).toBe('About')
      expect(result!.items[0].children).toHaveLength(2)
      expect(result!.items[0].children![0]).toEqual({ label: 'Team', url: '/about/team' })
      expect(result!.items[0].children![1]).toEqual({ label: 'Contact', url: '/contact' })
    })

    it('parses external links', async () => {
      const yaml = `items:
  - label: GitHub
    url: https://github.com
    external: true
`
      await fs.writeFile(path.join(tmpDir, 'navigation', 'footer.yaml'), yaml)

      const result = await navigation.getNavigation('footer')
      expect(result!.items[0]).toEqual({
        label: 'GitHub',
        url: 'https://github.com',
        external: true,
      })
    })

    it('parses entry references', async () => {
      const yaml = `items:
  - label: Featured Post
    entry: blog/hello-world
`
      await fs.writeFile(path.join(tmpDir, 'navigation', 'sidebar.yaml'), yaml)

      const result = await navigation.getNavigation('sidebar')
      expect(result!.items[0]).toEqual({
        label: 'Featured Post',
        entry: 'blog/hello-world',
      })
    })

    it('handles empty items gracefully', async () => {
      const yaml = `items: []\n`
      await fs.writeFile(path.join(tmpDir, 'navigation', 'empty.yaml'), yaml)

      const result = await navigation.getNavigation('empty')
      expect(result!.items).toEqual([])
    })

    it('returns cached result on second call', async () => {
      const yaml = `items:\n  - label: Home\n    url: /\n`
      await fs.writeFile(path.join(tmpDir, 'navigation', 'main.yaml'), yaml)

      const first = await navigation.getNavigation('main')
      await fs.writeFile(path.join(tmpDir, 'navigation', 'main.yaml'), `items:\n  - label: Changed\n    url: /changed\n`)
      const second = await navigation.getNavigation('main')

      expect(second).toEqual(first)
    })
  })

  describe('listNavigations', () => {
    it('returns empty array when no navigations exist', async () => {
      const result = await navigation.listNavigations()
      expect(result).toEqual([])
    })

    it('lists all navigation YAML files', async () => {
      await fs.writeFile(path.join(tmpDir, 'navigation', 'main.yaml'), `items:\n  - label: Home\n    url: /\n`)
      await fs.writeFile(path.join(tmpDir, 'navigation', 'footer.yaml'), `items:\n  - label: Privacy\n    url: /privacy\n`)

      const result = await navigation.listNavigations()
      expect(result).toHaveLength(2)
      const handles = result.map((n) => n.handle).sort()
      expect(handles).toEqual(['footer', 'main'])
    })
  })
})
