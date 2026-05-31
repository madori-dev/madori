#!/usr/bin/env node

import { scaffold } from './scaffold.js'

const args = process.argv.slice(2)
const projectName = args[0]

if (!projectName) {
  console.error('Usage: create-madori-app <project-name>')
  console.error('')
  console.error('Example:')
  console.error('  npx create-madori-app my-site')
  process.exit(1)
}

// Validate project name
if (!/^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/.test(projectName)) {
  console.error(
    `Invalid project name "${projectName}". Use lowercase letters, numbers, hyphens, and dots.`
  )
  process.exit(1)
}

scaffold(projectName)
