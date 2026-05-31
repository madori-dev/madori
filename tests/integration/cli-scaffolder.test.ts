import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as yaml from 'yaml'

// Mock execSync to skip pnpm install during tests
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
    // Create a temp directory and change cwd to it
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'madori-test-'))
    originalCwd = process.cwd()
    process.chdir(tempDir)
  })

  afterEach(() => {
    // Restore cwd and clean up temp directory
    process.chdir(originalCwd)
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('creates the correct directory structure', () => {
    scaffold(projectName)

    const projectDir = path.join(tempDir, projectName)

    const expectedDirs = [
      'content/collections/blog',
      'content/forms',
      'content/globals',
      'content/navigation',
      'content/taxonomies',
      'resources/blueprints/collections',
      'resources/fieldsets',
      'resources/roles',
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

  it('generates a valid package.json with expected dependencies', () => {
    scaffold(projectName)

    const projectDir = path.join(tempDir, projectName)
    const pkgPath = path.join(projectDir, 'package.json')

    expect(fs.existsSync(pkgPath)).toBe(true)

    const pkgContent = fs.readFileSync(pkgPath, 'utf-8')
    const pkg = JSON.parse(pkgContent)

    expect(pkg.name).toBe(projectName)
    expect(pkg.version).toBe('0.1.0')
    expect(pkg.private).toBe(true)
    expect(pkg.scripts).toBeDefined()
    expect(pkg.scripts.dev).toBe('next dev')
    expect(pkg.scripts.build).toBe('next build')
    expect(pkg.dependencies).toBeDefined()
    expect(pkg.dependencies.next).toBeDefined()
    expect(pkg.dependencies.react).toBeDefined()
    expect(pkg.dependencies['react-dom']).toBeDefined()
    expect(pkg.dependencies.yaml).toBeDefined()
    expect(pkg.dependencies['gray-matter']).toBeDefined()
    expect(pkg.dependencies.graphql).toBeDefined()
    expect(pkg.dependencies['graphql-yoga']).toBeDefined()
    expect(pkg.devDependencies).toBeDefined()
    expect(pkg.devDependencies.typescript).toBeDefined()
  })

  it('generates madori.config.ts', () => {
    scaffold(projectName)

    const projectDir = path.join(tempDir, projectName)
    const configPath = path.join(projectDir, 'madori.config.ts')

    expect(fs.existsSync(configPath)).toBe(true)

    const configContent = fs.readFileSync(configPath, 'utf-8')
    expect(configContent).toContain('MadoriConfig')
    expect(configContent).toContain('contentPath')
    expect(configContent).toContain('resourcesPath')
    expect(configContent).toContain('usersPath')
    expect(configContent).toContain('cp:')
    expect(configContent).toContain('graphql:')
    expect(configContent).toContain('collections:')
  })

  it('generates a valid blog blueprint YAML', () => {
    scaffold(projectName)

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

  it('generates admin user YAML', () => {
    scaffold(projectName)

    const projectDir = path.join(tempDir, projectName)
    const userPath = path.join(projectDir, 'users/admin.yaml')

    expect(fs.existsSync(userPath)).toBe(true)

    const userContent = fs.readFileSync(userPath, 'utf-8')
    const user = yaml.parse(userContent)

    expect(user).toBeDefined()
    expect(user.id).toBe('admin')
    expect(user.email).toBe('admin@example.com')
    expect(user.roles).toContain('admin')
  })

  it('generates admin role YAML', () => {
    scaffold(projectName)

    const projectDir = path.join(tempDir, projectName)
    const rolePath = path.join(projectDir, 'resources/roles/admin.yaml')

    expect(fs.existsSync(rolePath)).toBe(true)

    const roleContent = fs.readFileSync(rolePath, 'utf-8')
    const role = yaml.parse(roleContent)

    expect(role).toBeDefined()
    expect(role.handle).toBe('admin')
    expect(role.permissions).toBeInstanceOf(Array)
    expect(role.permissions.length).toBeGreaterThan(0)
  })

  it('generates sample blog entry', () => {
    scaffold(projectName)

    const projectDir = path.join(tempDir, projectName)
    const entryPath = path.join(projectDir, 'content/collections/blog/hello-world.md')

    expect(fs.existsSync(entryPath)).toBe(true)

    const entryContent = fs.readFileSync(entryPath, 'utf-8')
    expect(entryContent).toContain('title: Hello World')
    expect(entryContent).toContain('slug: hello-world')
    expect(entryContent).toContain('status: published')
  })

  it('generates additional config files (next.config.ts, tsconfig.json, .gitignore)', () => {
    scaffold(projectName)

    const projectDir = path.join(tempDir, projectName)

    expect(fs.existsSync(path.join(projectDir, 'next.config.ts'))).toBe(true)
    expect(fs.existsSync(path.join(projectDir, 'tsconfig.json'))).toBe(true)
    expect(fs.existsSync(path.join(projectDir, '.gitignore'))).toBe(true)

    // Verify tsconfig.json is valid JSON
    const tsconfigContent = fs.readFileSync(path.join(projectDir, 'tsconfig.json'), 'utf-8')
    const tsconfig = JSON.parse(tsconfigContent)
    expect(tsconfig.compilerOptions).toBeDefined()
    expect(tsconfig.compilerOptions.strict).toBe(true)
  })
})
