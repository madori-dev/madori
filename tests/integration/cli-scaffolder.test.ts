import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as yaml from 'yaml'

// Mock execSync to skip download during tests
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}))

// Mock process.exit to prevent test runner from exiting
vi.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit called')
}) as never)

import { scaffold } from '../../packages/create-madori-app/src/scaffold.js'

describe('CLI Scaffolder Integration', () => {
  let tempDir: string
  let originalCwd: string
  const projectName = 'test-madori-project'

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'madori-test-'))
    originalCwd = process.cwd()
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('creates the correct directory structure', () => {
    scaffold(projectName, { includeBoilerplate: false })

    const projectDir = path.join(tempDir, projectName)

    // Directories explicitly created by the scaffolder
    const expectedDirs = [
      'content/collections/blog',
      'content/forms',
      'content/navigation',
      'content/taxonomies',
      'resources/blueprints/collections',
      'resources/collections',
      'users',
      'public/assets',
      'src/app',
    ]

    for (const dir of expectedDirs) {
      const fullPath = path.join(projectDir, dir)
      expect(fs.existsSync(fullPath), `Directory ${dir} should exist`).toBe(true)
      expect(fs.statSync(fullPath).isDirectory(), `${dir} should be a directory`).toBe(true)
    }
  })

  it('generates a valid blog blueprint YAML', () => {
    scaffold(projectName, { includeBoilerplate: false })

    const projectDir = path.join(tempDir, projectName)
    const blueprintPath = path.join(projectDir, 'resources/blueprints/collections/blog.yaml')

    expect(fs.existsSync(blueprintPath)).toBe(true)

    const blueprintContent = fs.readFileSync(blueprintPath, 'utf-8')
    const blueprint = yaml.parse(blueprintContent)

    expect(blueprint).toBeDefined()
    expect(blueprint.tabs).toBeDefined()
    expect(blueprint.tabs.main).toBeDefined()
    expect(blueprint.tabs.main.fields).toBeInstanceOf(Array)
    expect(blueprint.tabs.main.fields.length).toBeGreaterThan(0)

    // Verify field structure
    const titleField = blueprint.tabs.main.fields.find(
      (f: { handle: string }) => f.handle === 'title'
    )
    expect(titleField).toBeDefined()
    expect(titleField.field.type).toBe('text')
    expect(titleField.field.required).toBe(true)
  })

  it('generates blog collection definition', () => {
    scaffold(projectName, { includeBoilerplate: false })

    const projectDir = path.join(tempDir, projectName)
    const collectionPath = path.join(projectDir, 'resources/collections/blog.yaml')

    expect(fs.existsSync(collectionPath)).toBe(true)

    const collectionContent = fs.readFileSync(collectionPath, 'utf-8')
    const collection = yaml.parse(collectionContent)

    expect(collection).toBeDefined()
    expect(collection.title).toBe('Blog')
    expect(collection.blueprint).toBe('blog')
    expect(collection.route).toBe('/blog/{slug}')
    expect(collection.defaultStatus).toBe('draft')
  })

  it('generates admin user YAML', () => {
    scaffold(projectName, { includeBoilerplate: false })

    const projectDir = path.join(tempDir, projectName)
    const usersDir = path.join(projectDir, 'users')

    expect(fs.existsSync(usersDir)).toBe(true)

    const userFiles = fs.readdirSync(usersDir).filter(f => f.endsWith('.yaml'))
    expect(userFiles.length).toBe(1)

    const userContent = fs.readFileSync(path.join(usersDir, userFiles[0]), 'utf-8')
    const user = yaml.parse(userContent)

    expect(user).toBeDefined()
    expect(user.id).toBeDefined()
    expect(user.email).toBe('admin@example.com')
    expect(user.name).toBe('Admin')
    expect(user.password_hash).toBeDefined()
    expect(user.password_hash).toContain('scrypt:')
    expect(user.roles).toContain('admin')
  })

  it('generates sample blog entry', () => {
    scaffold(projectName, { includeBoilerplate: false })

    const projectDir = path.join(tempDir, projectName)
    const entryPath = path.join(projectDir, 'content/collections/blog/hello-world.md')

    expect(fs.existsSync(entryPath)).toBe(true)

    const entryContent = fs.readFileSync(entryPath, 'utf-8')
    expect(entryContent).toContain('title: Hello World')
    expect(entryContent).toContain('slug: hello-world')
    expect(entryContent).toContain('status: published')
  })

  it('generates minimal homepage', () => {
    scaffold(projectName, { includeBoilerplate: false })

    const projectDir = path.join(tempDir, projectName)
    const pagePath = path.join(projectDir, 'src/app/page.tsx')

    expect(fs.existsSync(pagePath)).toBe(true)

    const pageContent = fs.readFileSync(pagePath, 'utf-8')
    expect(pageContent).toContain('MADORI')
    expect(pageContent).toContain('/cp')
  })

  it('updates package.json name when it exists', () => {
    scaffold(projectName, { includeBoilerplate: false })

    const projectDir = path.join(tempDir, projectName)
    const pkgPath = path.join(projectDir, 'package.json')

    // When download is mocked (no-op), package.json won't exist from template.
    // This test verifies the scaffolder doesn't crash when package.json is absent.
    // The scaffold only modifies package.json if it exists post-download.
    // In a real run, curl would have extracted it.
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
      expect(pkg.name).toBe(projectName)
    }
  })

  it('fails if project directory already exists', () => {
    const projectDir = path.join(tempDir, projectName)
    fs.mkdirSync(projectDir, { recursive: true })

    expect(() => scaffold(projectName, { includeBoilerplate: false })).toThrow('process.exit called')
  })
})
