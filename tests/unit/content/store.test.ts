import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { ContentStore } from '@/lib/content/store'

describe('ContentStore', () => {
  let tmpDir: string
  let store: ContentStore

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-content-store-test-'))
    store = new ContentStore(tmpDir)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function writeFile(subdir: string, filename: string, content: string) {
    const dir = path.join(tmpDir, subdir)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, filename), content, 'utf-8')
  }

  describe('getGlobal', () => {
    it('returns empty object when file does not exist', async () => {
      const result = await store.getGlobal('nonexistent')
      expect(result).toEqual({})
    })

    it('reads and parses a YAML global file', async () => {
      await writeFile('globals', 'site.yaml', 'site_name: My Site\ntagline: Hello World\n')

      const result = await store.getGlobal('site')
      expect(result).toEqual({ site_name: 'My Site', tagline: 'Hello World' })
    })

    it('reads and parses a JSON global file', async () => {
      await writeFile('globals', 'seo.json', JSON.stringify({ meta_title: 'SEO', robots: true }))

      const result = await store.getGlobal('seo')
      expect(result).toEqual({ meta_title: 'SEO', robots: true })
    })

    it('prefers .yaml over .json when both exist', async () => {
      await writeFile('globals', 'both.yaml', 'source: yaml\n')
      await writeFile('globals', 'both.json', '{"source": "json"}')

      const result = await store.getGlobal('both')
      expect(result).toEqual({ source: 'yaml' })
    })
  })

  describe('updateGlobal', () => {
    it('creates a new YAML file when none exists', async () => {
      const data = { site_name: 'New Site', enabled: true }
      const result = await store.updateGlobal('site', data)

      expect(result).toEqual(data)

      const filePath = path.join(tmpDir, 'globals', 'site.yaml')
      const content = await fs.readFile(filePath, 'utf-8')
      expect(content).toContain('site_name: New Site')
      expect(content).toContain('enabled: true')
    })

    it('preserves JSON format when updating existing JSON file', async () => {
      await writeFile('globals', 'seo.json', JSON.stringify({ old: 'data' }))

      const data = { meta_title: 'Updated SEO', robots: false }
      await store.updateGlobal('seo', data)

      const filePath = path.join(tmpDir, 'globals', 'seo.json')
      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(content)
      expect(parsed).toEqual(data)
    })

    it('preserves YAML format when updating existing YAML file', async () => {
      await writeFile('globals', 'site.yaml', 'site_name: Old\n')

      const data = { site_name: 'Updated' }
      await store.updateGlobal('site', data)

      const filePath = path.join(tmpDir, 'globals', 'site.yaml')
      const content = await fs.readFile(filePath, 'utf-8')
      expect(content).toContain('site_name: Updated')
      // Should not be JSON
      expect(content).not.toContain('{')
    })

    it('round-trips: updateGlobal then getGlobal returns same data', async () => {
      const data = { title: 'Test', nested: { key: 'value' }, count: 42 }
      await store.updateGlobal('roundtrip', data)

      const result = await store.getGlobal('roundtrip')
      expect(result).toEqual(data)
    })
  })

  describe('getNavigation', () => {
    it('returns { items: [] } when file does not exist', async () => {
      const result = await store.getNavigation('nonexistent')
      expect(result).toEqual({ items: [] })
    })

    it('reads and parses a YAML navigation file', async () => {
      const yaml = `items:
  - title: Home
    url: /
  - title: About
    url: /about
    children:
      - title: Team
        url: /about/team
`
      await writeFile('navigation', 'main.yaml', yaml)

      const result = await store.getNavigation('main')
      expect(result.items).toHaveLength(2)
      expect(result.items[0]).toEqual({ title: 'Home', url: '/' })
      expect(result.items[1].title).toBe('About')
      expect(result.items[1].children).toHaveLength(1)
      expect(result.items[1].children![0]).toEqual({ title: 'Team', url: '/about/team' })
    })

    it('reads and parses a JSON navigation file', async () => {
      const data = {
        items: [
          { title: 'Blog', url: '/blog' },
          { title: 'Entry', entry: 'pages/contact' },
        ],
      }
      await writeFile('navigation', 'footer.json', JSON.stringify(data))

      const result = await store.getNavigation('footer')
      expect(result).toEqual(data)
    })
  })

  describe('updateNavigation', () => {
    it('creates a new YAML file when none exists', async () => {
      const data = {
        items: [
          { title: 'Home', url: '/' },
          { title: 'Blog', url: '/blog' },
        ],
      }
      const result = await store.updateNavigation('main', data)

      expect(result).toEqual(data)

      const filePath = path.join(tmpDir, 'navigation', 'main.yaml')
      const content = await fs.readFile(filePath, 'utf-8')
      expect(content).toContain('title: Home')
      expect(content).toContain('title: Blog')
    })

    it('preserves JSON format when updating existing JSON file', async () => {
      await writeFile('navigation', 'footer.json', JSON.stringify({ items: [] }))

      const data = { items: [{ title: 'Contact', url: '/contact' }] }
      await store.updateNavigation('footer', data)

      const filePath = path.join(tmpDir, 'navigation', 'footer.json')
      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(content)
      expect(parsed).toEqual(data)
    })

    it('round-trips: updateNavigation then getNavigation returns same data', async () => {
      const data = {
        items: [
          { title: 'Home', url: '/' },
          {
            title: 'Products',
            url: '/products',
            children: [
              { title: 'Widget', url: '/products/widget' },
              { title: 'Gadget', entry: 'products/gadget' },
            ],
          },
        ],
      }
      await store.updateNavigation('complex', data)

      const result = await store.getNavigation('complex')
      expect(result).toEqual(data)
    })
  })
})
