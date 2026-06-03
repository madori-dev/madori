import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync } from 'node:child_process'

const REPO = 'madori-dev/madori'
const BRANCH = 'main'

/** Items to always strip from the cloned template */
const REMOVE_AFTER_CLONE = [
  'packages',
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
  'package-lock.json',
  '.claude',
  '.sessions',
  '.vscode',
  '.kiro',
  '.mcp.json',
  '.github',
  'CLAUDE.md',
  'AGENTS.md',
  'components.json.bak',
  'vitest.config.ts',
  'tests',
  'users',
]

/** Additional items to remove when boilerplate site is NOT included */
const BOILERPLATE_FILES = [
  'content/collections/pages',
  'content/navigation',
  'content/globals/site-settings.yaml',
  'resources/blueprints/collections/pages.yaml',
  'resources/blueprints/globals',
  'resources/collections/pages.yaml',
  'resources/fieldsets',
  'resources/globals',
  'src/components/blocks',
  'src/components/site',
  'src/app/[...slug]',
  'public/madori_logo.svg',
  'public/assets/logos',
  'public/assets/MADORI M.png',
  'public/assets/MADORI M_black.png',
  'public/assets/MADORI M_white.png',
]

export interface ScaffoldOptions {
  includeBoilerplate: boolean
}

export function scaffold(projectName: string, options: ScaffoldOptions): void {
  const projectDir = path.resolve(process.cwd(), projectName)

  if (fs.existsSync(projectDir)) {
    console.error(`Error: Directory "${projectName}" already exists.`)
    process.exit(1)
  }

  console.log(`\n  Creating MADORI project: ${projectName}\n`)

  // Download and extract from GitHub
  console.log('  ⬇ Downloading template from GitHub...')
  fs.mkdirSync(projectDir, { recursive: true })

  try {
    execSync(
      `curl -sL "https://github.com/${REPO}/archive/refs/heads/${BRANCH}.tar.gz" | tar -xz --strip-components=1 -C "${projectDir}"`,
      { stdio: 'pipe' }
    )
  } catch {
    fs.rmSync(projectDir, { recursive: true, force: true })
    console.error('  ✗ Failed to download template from GitHub.')
    console.error(`    Make sure https://github.com/${REPO} is accessible.`)
    process.exit(1)
  }
  console.log('  ✓ Downloaded template')

  // Remove workspace/dev files
  for (const item of REMOVE_AFTER_CLONE) {
    const itemPath = path.join(projectDir, item)
    if (fs.existsSync(itemPath)) {
      fs.rmSync(itemPath, { recursive: true, force: true })
    }
  }

  // If no boilerplate, strip the marketing site files
  if (!options.includeBoilerplate) {
    for (const item of BOILERPLATE_FILES) {
      const itemPath = path.join(projectDir, item)
      if (fs.existsSync(itemPath)) {
        fs.rmSync(itemPath, { recursive: true, force: true })
      }
    }

    // Replace the homepage with a minimal one
    const pageFile = path.join(projectDir, 'src/app/page.tsx')
    fs.writeFileSync(
      pageFile,
      `export default function Home() {
  return (
    <main className="flex min-h-svh items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">MADORI</h1>
        <p className="text-muted-foreground">
          Your CMS is ready. Visit{' '}
          <a href="/cp" className="underline font-medium">
            /cp
          </a>{' '}
          to start building.
        </p>
      </div>
    </main>
  )
}
`
    )

    // Create a minimal blog blueprint as a starter
    const blueprintDir = path.join(projectDir, 'resources/blueprints/collections')
    fs.mkdirSync(blueprintDir, { recursive: true })
    fs.writeFileSync(
      path.join(blueprintDir, 'blog.yaml'),
      `tabs:
  main:
    fields:
      - handle: title
        field:
          type: text
          display: Title
          required: true
      - handle: slug
        field:
          type: slug
      - handle: content
        field:
          type: tiptap
          display: Content
`
    )

    // Create a blog collection definition
    const collectionsDir = path.join(projectDir, 'resources/collections')
    fs.mkdirSync(collectionsDir, { recursive: true })
    fs.writeFileSync(
      path.join(collectionsDir, 'blog.yaml'),
      `title: Blog
blueprint: blog
route: /blog/{slug}
defaultStatus: draft
`
    )

    // Create a sample entry
    const blogContentDir = path.join(projectDir, 'content/collections/blog')
    fs.mkdirSync(blogContentDir, { recursive: true })
    fs.writeFileSync(
      path.join(blogContentDir, 'hello-world.md'),
      `---
title: Hello World
slug: hello-world
status: published
createdAt: ${new Date().toISOString()}
updatedAt: ${new Date().toISOString()}
---

# Hello World

Welcome to MADORI. This is your first blog post.
`
    )

    console.log('  ✓ Scaffolded blank project with blog collection')
  } else {
    console.log('  ✓ Included boilerplate site')
  }

  // Clean up workspace files
  console.log('  ✓ Cleaned up workspace files')

  // Update package.json
  const pkgPath = path.join(projectDir, 'package.json')
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    pkg.name = projectName
    delete pkg.workspaces
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  }
  console.log('  ✓ Configured package.json')

  // Create empty user-specific directories
  const dirs = ['users', 'content/forms', 'content/navigation', 'content/taxonomies', 'public/assets']
  for (const dir of dirs) {
    fs.mkdirSync(path.join(projectDir, dir), { recursive: true })
  }

  // Write initial admin user
  fs.writeFileSync(
    path.join(projectDir, 'users', 'admin.yaml'),
    `id: admin
email: admin@example.com
name: Admin
password_hash: changeme
roles:
  - admin
created_at: ${new Date().toISOString()}
`
  )
  console.log('  ✓ Created initial admin user')

  console.log(`
  ✅ MADORI project created!

  Next steps:

    cd ${projectName}
    pnpm install
    pnpm dev

  Then visit:
    • http://localhost:3000/cp — Control Panel
    • http://localhost:3000/api/graphql — GraphQL API

  Default admin login:
    Email:    admin@example.com
    Password: changeme

  ⚠️  Change the default admin password after first login!
`)
}
