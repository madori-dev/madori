import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as path from 'path'
import * as fs from 'fs/promises'
import * as os from 'os'
import { migrateDefinitions } from '../../../packages/madori-cli/src/commands/migrate-definitions'

describe('migrateDefinitions', () => {
  let tmpDir: string
  let resourcesPath: string
  let configPath: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-migrate-test-'))
    resourcesPath = path.join(tmpDir, 'resources')
    configPath = path.join(tmpDir, 'madori.config.ts')
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function writeConfig(content: string) {
    await fs.writeFile(configPath, content, 'utf-8')
  }

  it('creates YAML files for each taxonomy, global, and navigation', async () => {
    await writeConfig(`
export default {
  taxonomies: [
    { handle: 'tags', title: 'Tags' },
    { handle: 'categories', title: 'Categories', blueprint: 'category' }
  ],
  globals: [
    { handle: 'seo', title: 'SEO Settings' }
  ],
  navigations: [
    { handle: 'main', title: 'Main Nav', max_depth: 3 }
  ]
}
`)

    const result = await migrateDefinitions(configPath, resourcesPath)

    expect(result.created).toHaveLength(4)
    expect(result.skipped).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)

    // Verify files exist and have correct content
    const tagsContent = await fs.readFile(
      path.join(resourcesPath, 'taxonomies', 'tags.yaml'),
      'utf-8'
    )
    expect(tagsContent).toContain('title: Tags')

    const categoriesContent = await fs.readFile(
      path.join(resourcesPath, 'taxonomies', 'categories.yaml'),
      'utf-8'
    )
    expect(categoriesContent).toContain('title: Categories')
    expect(categoriesContent).toContain('blueprint: category')

    const seoContent = await fs.readFile(
      path.join(resourcesPath, 'globals', 'seo.yaml'),
      'utf-8'
    )
    expect(seoContent).toContain('title: SEO Settings')

    const navContent = await fs.readFile(
      path.join(resourcesPath, 'navigations', 'main.yaml'),
      'utf-8'
    )
    expect(navContent).toContain('title: Main Nav')
    expect(navContent).toContain('max_depth: 3')
  })

  it('skips files that already exist and logs warnings', async () => {
    // Pre-create a file
    await fs.mkdir(path.join(resourcesPath, 'taxonomies'), { recursive: true })
    await fs.writeFile(
      path.join(resourcesPath, 'taxonomies', 'tags.yaml'),
      'title: Existing Tags\n',
      'utf-8'
    )

    await writeConfig(`
export default {
  taxonomies: [
    { handle: 'tags', title: 'Tags (new)' },
    { handle: 'categories', title: 'Categories' }
  ],
  globals: [],
  navigations: []
}
`)

    const result = await migrateDefinitions(configPath, resourcesPath)

    expect(result.created).toHaveLength(1)
    expect(result.skipped).toHaveLength(1)
    expect(result.warnings.length).toBeGreaterThanOrEqual(1)

    // Verify original file was not overwritten
    const tagsContent = await fs.readFile(
      path.join(resourcesPath, 'taxonomies', 'tags.yaml'),
      'utf-8'
    )
    expect(tagsContent).toContain('Existing Tags')
    expect(tagsContent).not.toContain('Tags (new)')
  })

  it('handles config with no migratable properties', async () => {
    await writeConfig(`
export default {
  contentPath: './content',
  resourcesPath: './resources'
}
`)

    const result = await migrateDefinitions(configPath, resourcesPath)

    expect(result.created).toHaveLength(0)
    expect(result.skipped).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('warns when a definition has no handle', async () => {
    await writeConfig(`
export default {
  taxonomies: [
    { title: 'No Handle Taxonomy' }
  ],
  globals: [],
  navigations: []
}
`)

    const result = await migrateDefinitions(configPath, resourcesPath)

    expect(result.created).toHaveLength(0)
    expect(result.warnings.length).toBeGreaterThanOrEqual(1)
    expect(result.warnings[0]).toContain('without a handle')
  })

  it('strips handle from written definition data', async () => {
    await writeConfig(`
export default {
  taxonomies: [
    { handle: 'tags', title: 'Tags', blueprint: 'tag' }
  ],
  globals: [],
  navigations: []
}
`)

    const result = await migrateDefinitions(configPath, resourcesPath)

    expect(result.created).toHaveLength(1)

    const content = await fs.readFile(
      path.join(resourcesPath, 'taxonomies', 'tags.yaml'),
      'utf-8'
    )
    expect(content).not.toContain('handle:')
    expect(content).toContain('title: Tags')
    expect(content).toContain('blueprint: tag')
  })

  it('creates output directories if they do not exist', async () => {
    await writeConfig(`
export default {
  taxonomies: [{ handle: 'tags', title: 'Tags' }],
  globals: [{ handle: 'seo', title: 'SEO' }],
  navigations: [{ handle: 'footer', title: 'Footer' }]
}
`)

    const result = await migrateDefinitions(configPath, resourcesPath)

    expect(result.created).toHaveLength(3)

    // Verify directories were created
    const taxonomiesDir = await fs.stat(path.join(resourcesPath, 'taxonomies'))
    expect(taxonomiesDir.isDirectory()).toBe(true)

    const globalsDir = await fs.stat(path.join(resourcesPath, 'globals'))
    expect(globalsDir.isDirectory()).toBe(true)

    const navigationsDir = await fs.stat(path.join(resourcesPath, 'navigations'))
    expect(navigationsDir.isDirectory()).toBe(true)
  })

  it('returns warning when config file cannot be loaded', async () => {
    const result = await migrateDefinitions('/nonexistent/path.ts', resourcesPath)

    expect(result.created).toHaveLength(0)
    expect(result.warnings.length).toBeGreaterThanOrEqual(1)
    expect(result.warnings[0]).toContain('Failed to load config file')
  })
})
