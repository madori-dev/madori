import { describe, it, expect } from 'vitest'
import { htmlToMarkdown } from '../html-to-markdown.js'

describe('htmlToMarkdown', () => {
  describe('edge cases', () => {
    it('returns empty string for empty input', () => {
      expect(htmlToMarkdown('')).toBe('')
    })

    it('returns empty string for whitespace-only input', () => {
      expect(htmlToMarkdown('   \n  ')).toBe('')
    })

    it('returns empty string for null-ish coercion (undefined cast)', () => {
      // TypeScript prevents this normally, but runtime safety matters
      expect(htmlToMarkdown(null as unknown as string)).toBe('')
      expect(htmlToMarkdown(undefined as unknown as string)).toBe('')
    })
  })

  describe('CDATA stripping', () => {
    it('strips CDATA wrapping before conversion', () => {
      const input = '<![CDATA[<p>Hello world</p>]]>'
      expect(htmlToMarkdown(input)).toBe('Hello world')
    })

    it('handles multiple CDATA sections', () => {
      const input = '<![CDATA[<h1>Title</h1>]]><![CDATA[<p>Body</p>]]>'
      expect(htmlToMarkdown(input)).toBe('# Title\n\nBody')
    })
  })

  describe('headings', () => {
    it('converts h1-h6 to ATX-style markdown headings', () => {
      expect(htmlToMarkdown('<h1>Title</h1>')).toBe('# Title')
      expect(htmlToMarkdown('<h2>Subtitle</h2>')).toBe('## Subtitle')
      expect(htmlToMarkdown('<h3>Section</h3>')).toBe('### Section')
      expect(htmlToMarkdown('<h4>Sub</h4>')).toBe('#### Sub')
      expect(htmlToMarkdown('<h5>Deep</h5>')).toBe('##### Deep')
      expect(htmlToMarkdown('<h6>Deepest</h6>')).toBe('###### Deepest')
    })
  })

  describe('paragraphs', () => {
    it('converts paragraph tags to plain text with spacing', () => {
      const input = '<p>First paragraph</p><p>Second paragraph</p>'
      expect(htmlToMarkdown(input)).toBe('First paragraph\n\nSecond paragraph')
    })
  })

  describe('lists', () => {
    it('converts unordered lists with dash bullet marker', () => {
      const input = '<ul><li>Item one</li><li>Item two</li></ul>'
      const result = htmlToMarkdown(input)
      expect(result).toMatch(/^-\s+Item one/m)
      expect(result).toMatch(/^-\s+Item two/m)
    })

    it('converts ordered lists', () => {
      const input = '<ol><li>First</li><li>Second</li></ol>'
      const result = htmlToMarkdown(input)
      expect(result).toMatch(/^1\.\s+First/m)
      expect(result).toMatch(/^2\.\s+Second/m)
    })
  })

  describe('links', () => {
    it('converts anchor tags to markdown links', () => {
      const input = '<a href="https://example.com">Example</a>'
      expect(htmlToMarkdown(input)).toBe('[Example](https://example.com)')
    })
  })

  describe('emphasis', () => {
    it('converts em/i to asterisk emphasis', () => {
      const input = '<p>This is <em>important</em> text</p>'
      expect(htmlToMarkdown(input)).toBe('This is *important* text')
    })

    it('converts strong/b to double asterisk', () => {
      const input = '<p>This is <strong>bold</strong> text</p>'
      expect(htmlToMarkdown(input)).toBe('This is **bold** text')
    })
  })

  describe('code blocks', () => {
    it('converts pre/code to fenced code blocks', () => {
      const input = '<pre><code>const x = 1;</code></pre>'
      const result = htmlToMarkdown(input)
      expect(result).toContain('```')
      expect(result).toContain('const x = 1;')
    })

    it('converts inline code', () => {
      const input = '<p>Use <code>npm install</code> to install</p>'
      expect(htmlToMarkdown(input)).toBe('Use `npm install` to install')
    })
  })

  describe('horizontal rules', () => {
    it('converts hr to ---', () => {
      const input = '<p>Above</p><hr><p>Below</p>'
      const result = htmlToMarkdown(input)
      expect(result).toContain('---')
    })
  })

  describe('WordPress-specific handling', () => {
    it('converts figure with img and figcaption', () => {
      const input = '<figure><img src="/photo.jpg" alt="A photo"><figcaption>Caption text</figcaption></figure>'
      const result = htmlToMarkdown(input)
      expect(result).toContain('![A photo](/photo.jpg)')
      expect(result).toContain('*Caption text*')
    })

    it('handles figure with img but no caption', () => {
      const input = '<figure><img src="/photo.jpg" alt="Alt text"></figure>'
      const result = htmlToMarkdown(input)
      expect(result).toContain('![Alt text](/photo.jpg)')
    })

    it('passes through wp-block div content', () => {
      const input = '<div class="wp-block-group"><p>Block content</p></div>'
      const result = htmlToMarkdown(input)
      expect(result).toContain('Block content')
    })
  })

  describe('excessive blank line collapsing', () => {
    it('collapses 3+ blank lines to 2', () => {
      const input = '<p>One</p><br><br><br><br><p>Two</p>'
      const result = htmlToMarkdown(input)
      // Should not have more than one blank line between paragraphs
      expect(result).not.toMatch(/\n{3,}/)
    })
  })
})
