import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync } from 'node:child_process'

const REPO = 'madori-dev/cms'
const BRANCH = 'main'

/** Items to strip from the cloned template */
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

export function scaffold(projectName: string): void {
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
  } catch (err) {
    fs.rmSync(projectDir, { recursive: true, force: true })
    console.error('  ✗ Failed to download template from GitHub.')
    console.error(`    Make sure https://github.com/${REPO} is accessible.`)
    process.exit(1)
  }
  console.log('  ✓ Downloaded template')

  // Remove files that end users don't need
  for (const item of REMOVE_AFTER_CLONE) {
    const itemPath = path.join(projectDir, item)
    if (fs.existsSync(itemPath)) {
      fs.rmSync(itemPath, { recursive: true, force: true })
    }
  }
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

  // Simplify homepage content for fresh projects
  const homePath = path.join(projectDir, 'content/collections/pages/home.md')
  if (fs.existsSync(homePath)) {
    fs.writeFileSync(
      homePath,
      `---
title: Home
slug: home
status: published
---

# Welcome to MADORI

Your flat-file CMS is ready. Visit /cp to start building.
`
    )
  }

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
