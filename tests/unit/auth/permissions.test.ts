import { describe, it, expect, beforeEach } from 'vitest'
import { PermissionChecker } from '@/lib/auth/permissions'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'

function createMockFs(files: Record<string, string>): FileSystemAdapter {
  return {
    async readFile(path: string) {
      if (files[path] === undefined) throw new Error(`File not found: ${path}`)
      return files[path]
    },
    async writeFile() {},
    async deleteFile() {},
    async exists(path: string) {
      return path in files
    },
    async listFiles() { return [] },
    async listDirectories() { return [] },
    async mkdir() {},
    async copyFile() {},
    async moveFile() {},
  }
}

function createMockParser(): ContentParser {
  return {
    parseMarkdown(raw: string) {
      return { frontmatter: {}, content: raw }
    },
    serializeMarkdown(frontmatter, content) {
      return content
    },
    parseYaml<T>(raw: string): T {
      // Simple YAML-like parser for tests using the real yaml package
      const { parse } = require('yaml')
      return parse(raw) as T
    },
    serializeYaml(data) {
      const { stringify } = require('yaml')
      return stringify(data)
    },
  }
}

const adminYaml = `handle: admin
display: Administrator
permissions:
  - resource: collections
    actions: [view, create, edit, delete, publish]
  - resource: entries
    actions: [view, create, edit, delete, publish]
  - resource: users
    actions: [view, create, edit, delete]
  - resource: settings
    actions: [view, edit]
`

const editorYaml = `handle: editor
display: Editor
permissions:
  - resource: entries
    actions: [view, create, edit, publish]
  - resource: assets
    actions: [view, create, edit, delete]
`

const scopedYaml = `handle: blog_editor
display: Blog Editor
permissions:
  - resource: entries
    actions: [view, create, edit, publish]
    scope: blog
  - resource: assets
    actions: [view]
`

describe('PermissionChecker', () => {
  let checker: PermissionChecker
  let scopedChecker: PermissionChecker

  beforeEach(() => {
    const files: Record<string, string> = {
      '/resources/roles/admin.yaml': adminYaml,
      '/resources/roles/editor.yaml': editorYaml,
      '/resources/roles/blog_editor.yaml': scopedYaml,
    }
    const fs = createMockFs(files)
    const parser = createMockParser()
    checker = new PermissionChecker(fs, parser, '/resources')
    scopedChecker = new PermissionChecker(fs, parser, '/resources')
  })

  describe('loadRole', () => {
    it('loads an existing role', async () => {
      const role = await checker.loadRole('admin')
      expect(role).not.toBeNull()
      expect(role!.handle).toBe('admin')
      expect(role!.display).toBe('Administrator')
      expect(role!.permissions).toHaveLength(4)
    })

    it('returns null for non-existent role', async () => {
      const role = await checker.loadRole('nonexistent')
      expect(role).toBeNull()
    })
  })

  describe('loadRoles', () => {
    it('loads multiple roles', async () => {
      const roles = await checker.loadRoles(['admin', 'editor'])
      expect(roles).toHaveLength(2)
      expect(roles[0].handle).toBe('admin')
      expect(roles[1].handle).toBe('editor')
    })

    it('skips non-existent roles', async () => {
      const roles = await checker.loadRoles(['admin', 'nonexistent'])
      expect(roles).toHaveLength(1)
      expect(roles[0].handle).toBe('admin')
    })

    it('returns empty array for no valid roles', async () => {
      const roles = await checker.loadRoles(['nonexistent'])
      expect(roles).toHaveLength(0)
    })
  })

  describe('hasPermission', () => {
    it('grants permission when role allows it', async () => {
      const result = await checker.hasPermission(['admin'], 'collections', 'view')
      expect(result).toBe(true)
    })

    it('denies permission when role does not allow it', async () => {
      const result = await checker.hasPermission(['editor'], 'users', 'create')
      expect(result).toBe(false)
    })

    it('grants permission if any role allows it', async () => {
      const result = await checker.hasPermission(['editor', 'admin'], 'users', 'create')
      expect(result).toBe(true)
    })

    it('denies permission for empty roles', async () => {
      const result = await checker.hasPermission([], 'collections', 'view')
      expect(result).toBe(false)
    })

    it('denies permission for non-existent roles', async () => {
      const result = await checker.hasPermission(['nonexistent'], 'collections', 'view')
      expect(result).toBe(false)
    })

    it('denies permission for action not in role', async () => {
      const result = await checker.hasPermission(['editor'], 'entries', 'delete')
      expect(result).toBe(false)
    })
  })

  describe('scoped permissions', () => {
    it('grants scoped permission when scope matches', async () => {
      const result = await scopedChecker.hasPermission(['blog_editor'], 'entries', 'edit', 'blog')
      expect(result).toBe(true)
    })

    it('denies scoped permission when scope does not match', async () => {
      const result = await scopedChecker.hasPermission(['blog_editor'], 'entries', 'edit', 'pages')
      expect(result).toBe(false)
    })

    it('unscoped permission grants access to any scope', async () => {
      const result = await checker.hasPermission(['admin'], 'entries', 'edit', 'blog')
      expect(result).toBe(true)
    })

    it('unscoped permission grants access when no scope requested', async () => {
      const result = await checker.hasPermission(['admin'], 'entries', 'edit')
      expect(result).toBe(true)
    })

    it('scoped permission grants access when no scope requested', async () => {
      // A scoped permission still grants access when no specific scope is requested
      const result = await scopedChecker.hasPermission(['blog_editor'], 'entries', 'edit')
      expect(result).toBe(true)
    })
  })
})
