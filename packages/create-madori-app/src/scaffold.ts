import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync } from 'node:child_process'
import { randomBytes, scryptSync } from 'node:crypto'

const REPO = 'madori-dev/madori'
const BRANCH = 'main'

const SALT_LENGTH = 32
const KEY_LENGTH = 64

function hashPasswordSync(password: string): string {
  const salt = randomBytes(SALT_LENGTH)
  const hash = scryptSync(password, salt, KEY_LENGTH)
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`
}

/** Items to always strip from the cloned template */
const REMOVE_AFTER_CLONE = [
  'packages/create-madori-app',
  'packages/madori-sdk',
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
  'playwright.config.ts',
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
    fs.mkdirSync(path.dirname(pageFile), { recursive: true })
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
    // These scripts point into monorepo-only files removed above. Do not ship
    // commands which fail in generated applications.
    delete pkg.scripts?.test
    delete pkg.scripts?.e2e
    delete pkg.scripts?.['e2e:prepare']
    delete pkg.devDependencies?.['@playwright/test']
    pkg.scripts.verify = 'pnpm lint && pnpm exec tsc --noEmit && pnpm build && pnpm audit --prod --audit-level high'
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  }
  console.log('  ✓ Configured package.json')

  // pnpm 10 requires explicit approval for native build dependencies. The
  // template's workspace setting is removed above, so retain its safe allowlist
  // in generated projects rather than leaving installs unable to build Next.js.
  fs.writeFileSync(
    path.join(projectDir, 'pnpm-workspace.yaml'),
    `packages:
  - 'packages/*'

allowBuilds:
  esbuild: true
  sharp: true
  unrs-resolver: true
`
  )

  // Create empty user-specific directories
  const dirs = ['content/forms', 'content/navigation', 'content/taxonomies', 'public/assets', 'storage/seo']
  for (const dir of dirs) {
    fs.mkdirSync(path.join(projectDir, dir), { recursive: true })
  }
  fs.mkdirSync(path.join(projectDir, 'users'), { recursive: true, mode: 0o700 })
  fs.chmodSync(path.join(projectDir, 'users'), 0o700)

  // Copy .env.example to .env
  const envExamplePath = path.join(projectDir, '.env.example')
  const envPath = path.join(projectDir, '.env')
  if (fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath)
    console.log('  ✓ Created .env from .env.example')
  }

  // Write initial admin user
  const adminPassword = randomBytes(18).toString('base64url')
  const adminId = crypto.randomUUID()
  const passwordHash = hashPasswordSync(adminPassword)
  fs.writeFileSync(
    path.join(projectDir, 'users', `${adminId}.yaml`),
    `id: ${adminId}
email: admin@example.com
name: Admin
password_hash: ${passwordHash}
roles:
  - admin
created_at: ${new Date().toISOString()}
`,
    { mode: 0o600 },
  )
  console.log('  ✓ Created initial admin user')

  const workflowDir = path.join(projectDir, '.github', 'workflows')
  fs.mkdirSync(workflowDir, { recursive: true })
  fs.writeFileSync(path.join(workflowDir, 'ci.yml'), `name: Required CI
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6.1.0
        with:
          persist-credentials: false
      - uses: pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86 # v6.0.10
        with:
          version: 11.22.0
      - uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6.5.0
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm verify
`)

  console.log(`
  ✅ MADORI project created!

  Next steps:

    cd ${projectName}
    pnpm install
    pnpm dev

  Then visit:
    • http://localhost:3000/cp — Control Panel
    • http://localhost:3000/api/graphql — GraphQL API

  Generated admin login (store this password now):
    Email:    admin@example.com
    Password: ${adminPassword}

  ⚠️  This password is shown once. Change it after first login.
`)
}
