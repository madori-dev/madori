import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { scanMarkdownFiles, deriveTitle, deriveSlug } from '../markdown-scanner.js'

describe('deriveTitle', () => {
  it('converts kebab-case filename to title case', () => {
    expect(deriveTitle('my-blog-post.md')).toBe('My Blog Post')
  })

  it('converts snake_case filename to title case', () => {
    expect(deriveTitle('getting_started.md')).toBe('Getting Started')
  })

  it('handles single word', () => {
    expect(deriveTitle('readme.md')).toBe('Readme')
  })

  it('handles mixed casing in input', () => {
    expect(deriveTitle('My-Post.md')).toBe('My Post')
  })

  it('strips .md extension case-insensitively', () => {
    expect(deriveTitle('hello-world.MD')).toBe('Hello World')
  })
})

describe('deriveSlug', () => {
  it('converts spaced filename to slug', () => {
    expect(deriveSlug('My Blog Post.md')).toBe('my-blog-post')
  })

  it('converts underscores to dashes', () => {
    expect(deriveSlug('getting_started.md')).toBe('getting-started')
  })

  it('strips non-alphanumeric characters except dashes', () => {
    expect(deriveSlug("what's-new!.md")).toBe('whats-new')
  })

  it('handles already-slugged filenames', () => {
    expect(deriveSlug('my-blog-post.md')).toBe('my-blog-post')
  })

  it('lowercases everything', () => {
    expect(deriveSlug('README.md')).toBe('readme')
  })
})

describe('scanMarkdownFiles', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'md-scanner-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('yields ScannedFile for each .md file', async () => {
    await fs.writeFile(path.join(tmpDir, 'hello.md'), '# Hello\n\nWorld')

    const results: Awaited<ReturnType<typeof scanMarkdownFiles> extends AsyncGenerator<infer T> ? T : never>[] = []
    for await (const file of scanMarkdownFiles(tmpDir)) {
      results.push(file)
    }

    expect(results).toHaveLength(1)
    expect(results[0].relativePath).toBe('hello.md')
    expect(results[0].content).toBe('# Hello\n\nWorld')
    expect(results[0].frontmatter).toBeNull()
    expect(results[0].title).toBe('Hello')
    expect(results[0].slug).toBe('hello')
  })

  it('parses frontmatter and uses title/slug from it', async () => {
    const content = `---
title: Custom Title
slug: custom-slug
author: Test
---

Body content`
    await fs.writeFile(path.join(tmpDir, 'post.md'), content)

    const results = []
    for await (const file of scanMarkdownFiles(tmpDir)) {
      results.push(file)
    }

    expect(results[0].frontmatter).toEqual({ title: 'Custom Title', slug: 'custom-slug', author: 'Test' })
    expect(results[0].title).toBe('Custom Title')
    expect(results[0].slug).toBe('custom-slug')
    expect(results[0].content).toContain('Body content')
  })

  it('derives title/slug from filename when frontmatter lacks them', async () => {
    const content = `---
author: Someone
---

Content`
    await fs.writeFile(path.join(tmpDir, 'my-cool-post.md'), content)

    const results = []
    for await (const file of scanMarkdownFiles(tmpDir)) {
      results.push(file)
    }

    expect(results[0].frontmatter).toEqual({ author: 'Someone' })
    expect(results[0].title).toBe('My Cool Post')
    expect(results[0].slug).toBe('my-cool-post')
  })

  it('recursively scans subdirectories', async () => {
    const subDir = path.join(tmpDir, 'nested', 'deep')
    await fs.mkdir(subDir, { recursive: true })
    await fs.writeFile(path.join(tmpDir, 'top.md'), '# Top')
    await fs.writeFile(path.join(subDir, 'deep-file.md'), '# Deep')

    const results = []
    for await (const file of scanMarkdownFiles(tmpDir)) {
      results.push(file)
    }

    expect(results).toHaveLength(2)
    const paths = results.map((r) => r.relativePath).sort()
    expect(paths).toEqual([path.join('nested', 'deep', 'deep-file.md'), 'top.md'])
  })

  it('ignores non-.md files', async () => {
    await fs.writeFile(path.join(tmpDir, 'readme.md'), '# Read')
    await fs.writeFile(path.join(tmpDir, 'notes.txt'), 'text file')
    await fs.writeFile(path.join(tmpDir, 'config.yaml'), 'key: val')

    const results = []
    for await (const file of scanMarkdownFiles(tmpDir)) {
      results.push(file)
    }

    expect(results).toHaveLength(1)
    expect(results[0].relativePath).toBe('readme.md')
  })

  it('yields nothing for empty directory', async () => {
    const results = []
    for await (const file of scanMarkdownFiles(tmpDir)) {
      results.push(file)
    }

    expect(results).toHaveLength(0)
  })

  it('handles files with no frontmatter (no --- delimiters)', async () => {
    await fs.writeFile(path.join(tmpDir, 'plain-file.md'), '# Just markdown\n\nNo frontmatter here.')

    const results = []
    for await (const file of scanMarkdownFiles(tmpDir)) {
      results.push(file)
    }

    expect(results[0].frontmatter).toBeNull()
    expect(results[0].title).toBe('Plain File')
    expect(results[0].slug).toBe('plain-file')
  })
})
