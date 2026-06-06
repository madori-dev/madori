import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import fc from 'fast-check'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseWxrFile } from '../wordpress-parser.js'
import { htmlToMarkdown } from '../html-to-markdown.js'

/**
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
 * Property 9: WordPress migration preserves entry metadata
 * Property 10: HTML to Markdown conversion
 * Property 11: WordPress taxonomy mapping
 */

const TEST_DIR = join(tmpdir(), 'madori-wp-property-' + Date.now())

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true })
})

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

let fileCounter = 0
function writeTempWxr(content: string): string {
  const path = join(TEST_DIR, `wxr-${fileCounter++}.xml`)
  writeFileSync(path, content, 'utf-8')
  return path
}

// --- Generators ---

/** Generate a safe XML text string (no special XML chars unescaped) */
const safeXmlText = fc.stringMatching(/^[A-Za-z0-9 ]{1,40}$/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0)

/** Generate a valid slug (lowercase alphanumeric + hyphens) */
const slugArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,20}[a-z0-9]$/)
  .filter((s) => !s.includes('--'))

/** Generate a valid WordPress date string "YYYY-MM-DD HH:MM:SS" */
const wpDateArb = fc.tuple(
  fc.integer({ min: 2000, max: 2030 }),
  fc.integer({ min: 1, max: 12 }),
  fc.integer({ min: 1, max: 28 }),
  fc.integer({ min: 0, max: 23 }),
  fc.integer({ min: 0, max: 59 }),
  fc.integer({ min: 0, max: 59 })
).map(([y, m, d, h, min, s]) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')} ${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`
)

/** Generate a valid post type */
const postTypeArb = fc.constantFrom('post', 'page')

/** Generate category names (safe XML text) */
const categoryNameArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,20}$/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0)

/** Generate tag names (safe XML text) */
const tagNameArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,20}$/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0)

/** Build a WXR XML string from generated metadata */
function buildWxrXml(item: {
  title: string
  slug: string
  pubDate: string
  author: string
  type: 'post' | 'page'
  categories: string[]
  tags: string[]
}): string {
  const categoryElements = item.categories
    .map((c) => `    <category domain="category"><![CDATA[${c}]]></category>`)
    .join('\n')
  const tagElements = item.tags
    .map((t) => `    <category domain="post_tag"><![CDATA[${t}]]></category>`)
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
  <title>Test</title>
  <item>
    <title><![CDATA[${item.title}]]></title>
    <dc:creator><![CDATA[${item.author}]]></dc:creator>
    <content:encoded><![CDATA[<p>Content body</p>]]></content:encoded>
    <wp:post_name><![CDATA[${item.slug}]]></wp:post_name>
    <wp:post_type>${item.type}</wp:post_type>
    <wp:post_date>${item.pubDate}</wp:post_date>
    <wp:status>publish</wp:status>
${categoryElements}
${tagElements}
  </item>
</channel>
</rss>`
}

// --- Property 9: WordPress migration preserves entry metadata ---

describe('WordPress Migration — Property Tests', () => {
  /**
   * **Validates: Requirements 6.1, 6.4**
   * Property 9: WordPress migration preserves entry metadata
   *
   * For any valid WxrItem with random title, slug, pubDate, author,
   * parsing and extracting preserves those exact values.
   */
  describe('Property 9: WordPress migration preserves entry metadata', () => {
    it('preserves title, slug, author, and pubDate through parse', async () => {
      await fc.assert(
        fc.asyncProperty(
          safeXmlText,
          slugArb,
          wpDateArb,
          safeXmlText,
          postTypeArb,
          async (title, slug, pubDate, author, type) => {
            const xml = buildWxrXml({
              title,
              slug,
              pubDate,
              author,
              type,
              categories: [],
              tags: [],
            })

            const filePath = writeTempWxr(xml)
            const items = []
            for await (const item of parseWxrFile(filePath)) {
              items.push(item)
            }

            expect(items).toHaveLength(1)
            const parsed = items[0]

            // Title preserved exactly
            expect(parsed.title).toBe(title)

            // Slug preserved exactly
            expect(parsed.slug).toBe(slug)

            // Author preserved exactly
            expect(parsed.author).toBe(author)

            // PubDate is converted to ISO format from the WP format
            const expectedIso = pubDate.replace(' ', 'T') + 'Z'
            const expectedDate = new Date(expectedIso)
            expect(parsed.pubDate).toBe(expectedDate.toISOString())

            // Type preserved
            expect(parsed.type).toBe(type)
          }
        ),
        { numRuns: 40 }
      )
    })
  })

  // --- Property 10: HTML to Markdown conversion ---

  /**
   * **Validates: Requirements 6.2**
   * Property 10: HTML to Markdown conversion
   *
   * For any HTML string containing standard elements (h1-h6, p, ul/ol/li, a, em/strong),
   * htmlToMarkdown produces a non-empty string that doesn't contain the original HTML tags.
   */
  describe('Property 10: HTML to Markdown conversion', () => {
    /** Generator for random inner text content (no HTML special chars) */
    const innerText = fc.stringMatching(/^[A-Za-z0-9 ]{1,30}$/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    /** Generator for HTML fragments with supported tags */
    const htmlFragment = fc.oneof(
      // Headings
      fc.tuple(fc.integer({ min: 1, max: 6 }), innerText).map(
        ([level, text]) => ({ html: `<h${level}>${text}</h${level}>`, tag: `h${level}` })
      ),
      // Paragraphs
      innerText.map((text) => ({ html: `<p>${text}</p>`, tag: 'p' })),
      // Emphasis
      innerText.map((text) => ({ html: `<em>${text}</em>`, tag: 'em' })),
      // Strong
      innerText.map((text) => ({ html: `<strong>${text}</strong>`, tag: 'strong' })),
      // Links
      fc.tuple(innerText, innerText).map(
        ([text, href]) => ({ html: `<a href="https://${href}.com">${text}</a>`, tag: 'a' })
      ),
      // Unordered lists
      fc.array(innerText, { minLength: 1, maxLength: 4 }).map(
        (items) => ({
          html: `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`,
          tag: 'ul',
        })
      ),
      // Ordered lists
      fc.array(innerText, { minLength: 1, maxLength: 4 }).map(
        (items) => ({
          html: `<ol>${items.map((i) => `<li>${i}</li>`).join('')}</ol>`,
          tag: 'ol',
        })
      )
    )

    it('output is non-empty for non-empty HTML input', () => {
      fc.assert(
        fc.property(htmlFragment, ({ html }) => {
          const result = htmlToMarkdown(html)
          expect(result.length).toBeGreaterThan(0)
        }),
        { numRuns: 100 }
      )
    })

    it('output does not contain raw HTML tags for supported elements', () => {
      fc.assert(
        fc.property(htmlFragment, ({ html, tag }) => {
          const result = htmlToMarkdown(html)
          // The output should not contain opening or closing tags for the supported element
          const openTagRegex = new RegExp(`<${tag}[\\s>]`, 'i')
          const closeTagRegex = new RegExp(`</${tag}>`, 'i')
          expect(result).not.toMatch(openTagRegex)
          expect(result).not.toMatch(closeTagRegex)
        }),
        { numRuns: 100 }
      )
    })

    it('output does not contain <li> tags', () => {
      fc.assert(
        fc.property(htmlFragment, ({ html }) => {
          const result = htmlToMarkdown(html)
          expect(result).not.toMatch(/<li[\s>]/i)
          expect(result).not.toMatch(/<\/li>/i)
        }),
        { numRuns: 100 }
      )
    })
  })

  // --- Property 11: WordPress taxonomy mapping ---

  /**
   * **Validates: Requirements 6.3**
   * Property 11: WordPress taxonomy mapping
   *
   * For any set of random category names and tag names in a WXR file,
   * the parsed items correctly separate categories from tags,
   * and each value appears in the correct array.
   */
  describe('Property 11: WordPress taxonomy mapping', () => {
    it('categories and tags are correctly separated', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(categoryNameArb, { minLength: 0, maxLength: 5 }),
          fc.array(tagNameArb, { minLength: 0, maxLength: 5 }),
          async (categories, tags) => {
            const xml = buildWxrXml({
              title: 'Test Post',
              slug: 'test-post',
              pubDate: '2023-06-15 10:30:00',
              author: 'admin',
              type: 'post',
              categories,
              tags,
            })

            const filePath = writeTempWxr(xml)
            const items = []
            for await (const item of parseWxrFile(filePath)) {
              items.push(item)
            }

            expect(items).toHaveLength(1)
            const parsed = items[0]

            // All categories appear in the categories array
            expect(parsed.categories).toHaveLength(categories.length)
            for (let i = 0; i < categories.length; i++) {
              expect(parsed.categories[i]).toBe(categories[i])
            }

            // All tags appear in the tags array
            expect(parsed.tags).toHaveLength(tags.length)
            for (let i = 0; i < tags.length; i++) {
              expect(parsed.tags[i]).toBe(tags[i])
            }

            // No category appears in tags
            for (const cat of categories) {
              if (!tags.includes(cat)) {
                expect(parsed.tags).not.toContain(cat)
              }
            }

            // No tag appears in categories
            for (const tag of tags) {
              if (!categories.includes(tag)) {
                expect(parsed.categories).not.toContain(tag)
              }
            }
          }
        ),
        { numRuns: 40 }
      )
    })

    it('each unique category value appears exactly the expected number of times', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(categoryNameArb, { minLength: 1, maxLength: 8 }),
          async (categories) => {
            const xml = buildWxrXml({
              title: 'Test Post',
              slug: 'test-post',
              pubDate: '2023-06-15 10:30:00',
              author: 'admin',
              type: 'post',
              categories,
              tags: [],
            })

            const filePath = writeTempWxr(xml)
            const items = []
            for await (const item of parseWxrFile(filePath)) {
              items.push(item)
            }

            const parsed = items[0]
            // The parsed categories array should match the input exactly (preserving order and duplicates)
            expect(parsed.categories).toEqual(categories)
          }
        ),
        { numRuns: 40 }
      )
    })

    it('each unique tag value appears exactly the expected number of times', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(tagNameArb, { minLength: 1, maxLength: 8 }),
          async (tags) => {
            const xml = buildWxrXml({
              title: 'Test Post',
              slug: 'test-post',
              pubDate: '2023-06-15 10:30:00',
              author: 'admin',
              type: 'post',
              categories: [],
              tags,
            })

            const filePath = writeTempWxr(xml)
            const items = []
            for await (const item of parseWxrFile(filePath)) {
              items.push(item)
            }

            const parsed = items[0]
            // The parsed tags array should match the input exactly
            expect(parsed.tags).toEqual(tags)
          }
        ),
        { numRuns: 40 }
      )
    })
  })
})
