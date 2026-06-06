import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseWxrFile } from '../wordpress-parser.js'

const TEST_DIR = join(tmpdir(), 'madori-wxr-test-' + Date.now())

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true })
})

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

function writeTempFile(name: string, content: string): string {
  const path = join(TEST_DIR, name)
  writeFileSync(path, content, 'utf-8')
  return path
}

const VALID_WXR = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:wfw="http://wellformedweb.org/CommentAPI/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wp="http://wordpress.org/export/1.2/"
>
<channel>
  <title>Test Blog</title>
  <item>
    <title>Hello World</title>
    <dc:creator>admin</dc:creator>
    <content:encoded><![CDATA[<p>This is my first post.</p>]]></content:encoded>
    <wp:post_name>hello-world</wp:post_name>
    <wp:post_type>post</wp:post_type>
    <wp:post_date>2023-06-15 10:30:00</wp:post_date>
    <wp:status>publish</wp:status>
    <category domain="category">Tech</category>
    <category domain="category">News</category>
    <category domain="post_tag">intro</category>
  </item>
  <item>
    <title>About Us</title>
    <dc:creator>editor</dc:creator>
    <content:encoded><![CDATA[<h1>About</h1><p>We are a team.</p>]]></content:encoded>
    <wp:post_name>about-us</wp:post_name>
    <wp:post_type>page</wp:post_type>
    <wp:post_date>2023-07-01 08:00:00</wp:post_date>
    <wp:status>draft</wp:status>
  </item>
  <item>
    <title>Logo</title>
    <wp:post_name>logo</wp:post_name>
    <wp:post_type>attachment</wp:post_type>
    <wp:post_date>2023-07-02 09:00:00</wp:post_date>
    <wp:status>inherit</wp:status>
  </item>
</channel>
</rss>`

describe('parseWxrFile', () => {
  it('parses posts and pages from a valid WXR file', async () => {
    const filePath = writeTempFile('valid.xml', VALID_WXR)
    const items: Awaited<ReturnType<typeof parseWxrFile>> extends AsyncGenerator<infer T> ? T[] : never = []

    for await (const item of parseWxrFile(filePath)) {
      items.push(item)
    }

    expect(items).toHaveLength(2)
  })

  it('extracts all fields from a post item', async () => {
    const filePath = writeTempFile('fields.xml', VALID_WXR)
    const items = []

    for await (const item of parseWxrFile(filePath)) {
      items.push(item)
    }

    const post = items[0]
    expect(post.title).toBe('Hello World')
    expect(post.slug).toBe('hello-world')
    expect(post.type).toBe('post')
    expect(post.content).toBe('<p>This is my first post.</p>')
    expect(post.pubDate).toBe('2023-06-15T10:30:00.000Z')
    expect(post.author).toBe('admin')
    expect(post.categories).toEqual(['Tech', 'News'])
    expect(post.tags).toEqual(['intro'])
    expect(post.status).toBe('publish')
  })

  it('extracts page items correctly', async () => {
    const filePath = writeTempFile('pages.xml', VALID_WXR)
    const items = []

    for await (const item of parseWxrFile(filePath)) {
      items.push(item)
    }

    const page = items[1]
    expect(page.title).toBe('About Us')
    expect(page.slug).toBe('about-us')
    expect(page.type).toBe('page')
    expect(page.content).toBe('<h1>About</h1><p>We are a team.</p>')
    expect(page.author).toBe('editor')
    expect(page.status).toBe('draft')
    expect(page.categories).toEqual([])
    expect(page.tags).toEqual([])
  })

  it('skips non-post/page items (e.g. attachments)', async () => {
    const filePath = writeTempFile('skip-attachments.xml', VALID_WXR)
    const items = []

    for await (const item of parseWxrFile(filePath)) {
      items.push(item)
    }

    const types = items.map((i) => i.type)
    expect(types).not.toContain('attachment')
    expect(items).toHaveLength(2)
  })

  it('throws on file without rss element', async () => {
    const xml = `<?xml version="1.0"?><feed><entry>Hello</entry></feed>`
    const filePath = writeTempFile('no-rss.xml', xml)

    const items = []
    await expect(async () => {
      for await (const item of parseWxrFile(filePath)) {
        items.push(item)
      }
    }).rejects.toThrow('Not a valid WordPress export (WXR) file')
  })

  it('throws on file without channel element', async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><item><title>X</title></item></rss>`
    const filePath = writeTempFile('no-channel.xml', xml)

    const items = []
    await expect(async () => {
      for await (const item of parseWxrFile(filePath)) {
        items.push(item)
      }
    }).rejects.toThrow('Not a valid WordPress export (WXR) file')
  })

  it('throws on non-existent file', async () => {
    await expect(async () => {
      for await (const _item of parseWxrFile('/nonexistent/path.xml')) {
        // should not reach here
      }
    }).rejects.toThrow()
  })

  it('handles items with private status', async () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:wp="http://wordpress.org/export/1.2/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <item>
    <title>Secret Post</title>
    <wp:post_name>secret</wp:post_name>
    <wp:post_type>post</wp:post_type>
    <wp:post_date>2023-08-01 12:00:00</wp:post_date>
    <wp:status>private</wp:status>
    <dc:creator>admin</dc:creator>
    <content:encoded><![CDATA[<p>Private content.</p>]]></content:encoded>
  </item>
</channel>
</rss>`
    const filePath = writeTempFile('private.xml', xml)
    const items = []

    for await (const item of parseWxrFile(filePath)) {
      items.push(item)
    }

    expect(items).toHaveLength(1)
    expect(items[0].status).toBe('private')
  })

  it('handles empty WXR file with no items', async () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>Empty Blog</title></channel>
</rss>`
    const filePath = writeTempFile('empty.xml', xml)
    const items = []

    for await (const item of parseWxrFile(filePath)) {
      items.push(item)
    }

    expect(items).toHaveLength(0)
  })

  it('defaults unknown status to draft', async () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:wp="http://wordpress.org/export/1.2/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <item>
    <title>Pending Post</title>
    <wp:post_name>pending</wp:post_name>
    <wp:post_type>post</wp:post_type>
    <wp:post_date>2023-09-01 00:00:00</wp:post_date>
    <wp:status>pending</wp:status>
    <dc:creator>admin</dc:creator>
    <content:encoded><![CDATA[<p>Pending.</p>]]></content:encoded>
  </item>
</channel>
</rss>`
    const filePath = writeTempFile('pending.xml', xml)
    const items = []

    for await (const item of parseWxrFile(filePath)) {
      items.push(item)
    }

    expect(items[0].status).toBe('draft')
  })

  it('converts WordPress date format to ISO', async () => {
    const filePath = writeTempFile('dates.xml', VALID_WXR)
    const items = []

    for await (const item of parseWxrFile(filePath)) {
      items.push(item)
    }

    expect(items[0].pubDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })
})
