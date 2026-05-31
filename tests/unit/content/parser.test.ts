import { describe, it, expect } from 'vitest'
import { MarkdownYamlParser } from '@/lib/fs/parser'

describe('MarkdownYamlParser', () => {
  const parser = new MarkdownYamlParser()

  describe('parseMarkdown', () => {
    it('parses frontmatter and content from a standard markdown file', () => {
      const raw = `---
title: Hello World
slug: hello-world
status: published
---

# Hello World

Welcome to MADORI.
`
      const result = parser.parseMarkdown(raw)
      expect(result.frontmatter).toEqual({
        title: 'Hello World',
        slug: 'hello-world',
        status: 'published',
      })
      expect(result.content).toBe('# Hello World\n\nWelcome to MADORI.')
    })

    it('handles empty frontmatter', () => {
      const raw = `---
---

Some content here.
`
      const result = parser.parseMarkdown(raw)
      expect(result.frontmatter).toEqual({})
      expect(result.content).toBe('Some content here.')
    })

    it('handles frontmatter-only (no content body)', () => {
      const raw = `---
title: No Content
---
`
      const result = parser.parseMarkdown(raw)
      expect(result.frontmatter).toEqual({ title: 'No Content' })
      expect(result.content).toBe('')
    })

    it('handles content-only (no frontmatter)', () => {
      const raw = `# Just Content

No frontmatter here.`
      const result = parser.parseMarkdown(raw)
      expect(result.frontmatter).toEqual({})
      expect(result.content).toBe('# Just Content\n\nNo frontmatter here.')
    })

    it('handles arrays and nested objects in frontmatter', () => {
      const raw = `---
title: Complex
tags:
  - one
  - two
meta:
  description: A description
  keywords:
    - foo
    - bar
---

Content.
`
      const result = parser.parseMarkdown(raw)
      expect(result.frontmatter.tags).toEqual(['one', 'two'])
      expect(result.frontmatter.meta).toEqual({
        description: 'A description',
        keywords: ['foo', 'bar'],
      })
    })

    it('handles special characters in YAML values', () => {
      const raw = `---
title: "Hello: World"
description: "This has a # hash and a : colon"
---

Content.
`
      const result = parser.parseMarkdown(raw)
      expect(result.frontmatter.title).toBe('Hello: World')
      expect(result.frontmatter.description).toBe('This has a # hash and a : colon')
    })

    it('handles dates in frontmatter', () => {
      const raw = `---
title: Dated Entry
created_at: 2024-01-15T10:00:00Z
published_date: 2024-06-01
---

Content with dates.
`
      const result = parser.parseMarkdown(raw)
      expect(result.frontmatter.title).toBe('Dated Entry')
      // gray-matter + yaml parses ISO dates as Date objects
      expect(result.frontmatter.created_at).toBeInstanceOf(Date)
      expect(result.frontmatter.published_date).toBeInstanceOf(Date)
    })

    it('handles multiline strings in YAML frontmatter', () => {
      const raw = `---
title: Multiline Test
description: >
  This is a long description
  that spans multiple lines
  and should be folded into one.
bio: |
  Line one.
  Line two.
  Line three.
---

Body content.
`
      const result = parser.parseMarkdown(raw)
      expect(result.frontmatter.title).toBe('Multiline Test')
      // Folded scalar (>) joins lines with spaces
      expect((result.frontmatter.description as string).trim()).toContain('This is a long description')
      // Literal scalar (|) preserves newlines
      expect(result.frontmatter.bio).toContain('Line one.\nLine two.\nLine three.')
    })

    it('handles unicode content in frontmatter and body', () => {
      const raw = `---
title: "日本語のタイトル"
author: "José García"
tags:
  - "café"
  - "naïve"
  - "中文标签"
---

# Ünïcödé Cöntënt

こんにちは世界。Ñoño. Ελληνικά. العربية.
`
      const result = parser.parseMarkdown(raw)
      expect(result.frontmatter.title).toBe('日本語のタイトル')
      expect(result.frontmatter.author).toBe('José García')
      expect(result.frontmatter.tags).toEqual(['café', 'naïve', '中文标签'])
      expect(result.content).toContain('こんにちは世界')
      expect(result.content).toContain('Ελληνικά')
      expect(result.content).toContain('العربية')
    })

    it('handles very large frontmatter objects', () => {
      const fields: Record<string, string> = {}
      const lines = ['---']
      for (let i = 0; i < 100; i++) {
        const key = `field_${i}`
        const value = `value_${i}_${'x'.repeat(50)}`
        fields[key] = value
        lines.push(`${key}: "${value}"`)
      }
      lines.push('---')
      lines.push('')
      lines.push('Body content.')

      const raw = lines.join('\n')
      const result = parser.parseMarkdown(raw)

      expect(Object.keys(result.frontmatter)).toHaveLength(100)
      expect(result.frontmatter.field_0).toBe(fields.field_0)
      expect(result.frontmatter.field_99).toBe(fields.field_99)
      expect(result.content).toBe('Body content.')
    })
  })

  describe('serializeMarkdown', () => {
    it('produces valid frontmatter delimiters with content', () => {
      const frontmatter = { title: 'Test', slug: 'test' }
      const content = '# Test\n\nHello world.'
      const result = parser.serializeMarkdown(frontmatter, content)

      expect(result).toContain('---\n')
      expect(result).toContain('title: Test')
      expect(result).toContain('slug: test')
      expect(result).toContain('# Test\n\nHello world.\n')
    })

    it('handles empty frontmatter', () => {
      const result = parser.serializeMarkdown({}, 'Just content.')
      expect(result).toContain('---\n')
      expect(result).toContain('Just content.\n')
    })

    it('handles empty content', () => {
      const result = parser.serializeMarkdown({ title: 'Empty' }, '')
      expect(result).toContain('title: Empty')
      expect(result).toContain('---\n')
    })
  })

  describe('serializeMarkdown round-trip', () => {
    it('round-trips unicode content through serialize and parse', () => {
      const frontmatter = { title: '日本語のタイトル', author: 'José García' }
      const content = '# こんにちは\n\nÜnïcödé body.'
      const serialized = parser.serializeMarkdown(frontmatter, content)
      const parsed = parser.parseMarkdown(serialized)

      expect(parsed.frontmatter.title).toBe('日本語のタイトル')
      expect(parsed.frontmatter.author).toBe('José García')
      expect(parsed.content).toBe('# こんにちは\n\nÜnïcödé body.')
    })
  })

  describe('parseYaml', () => {
    it('parses a YAML string into an object', () => {
      const raw = `site_name: My Website
tagline: Built with MADORI
`
      const result = parser.parseYaml<{ site_name: string; tagline: string }>(raw)
      expect(result.site_name).toBe('My Website')
      expect(result.tagline).toBe('Built with MADORI')
    })

    it('handles empty string gracefully', () => {
      const result = parser.parseYaml('')
      expect(result).toEqual({})
    })

    it('handles whitespace-only string gracefully', () => {
      const result = parser.parseYaml('   \n  \n  ')
      expect(result).toEqual({})
    })

    it('parses nested YAML structures', () => {
      const raw = `items:
  - label: Home
    url: /
  - label: Blog
    url: /blog
`
      const result = parser.parseYaml<{ items: Array<{ label: string; url: string }> }>(raw)
      expect(result.items).toHaveLength(2)
      expect(result.items[0]).toEqual({ label: 'Home', url: '/' })
    })
  })

  describe('serializeYaml', () => {
    it('serializes an object to YAML', () => {
      const data = { site_name: 'My Website', tagline: 'Built with MADORI' }
      const result = parser.serializeYaml(data)
      expect(result).toContain('site_name: My Website')
      expect(result).toContain('tagline: Built with MADORI')
    })

    it('serializes nested structures', () => {
      const data = {
        items: [
          { label: 'Home', url: '/' },
          { label: 'Blog', url: '/blog' },
        ],
      }
      const result = parser.serializeYaml(data)
      expect(result).toContain('items:')
      expect(result).toContain('label: Home')
      expect(result).toContain('url: /')
    })

    it('serializes empty object', () => {
      const result = parser.serializeYaml({})
      expect(result).toBe('{}\n')
    })
  })
})
