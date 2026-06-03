#!/usr/bin/env node

import * as readline from 'node:readline'
import { scaffold } from './scaffold.js'

const args = process.argv.slice(2)
const projectName = args[0]

if (!projectName) {
  console.error('Usage: create-madori-app <project-name>')
  console.error('')
  console.error('Example:')
  console.error('  pnpm dlx create-madori-app my-site')
  process.exit(1)
}

// Validate project name
if (!/^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/.test(projectName)) {
  console.error(
    `Invalid project name "${projectName}". Use lowercase letters, numbers, hyphens, and dots.`
  )
  process.exit(1)
}

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase())
    })
  })
}

async function main() {
  const answer = await ask('\n  Include the boilerplate site? (homepage, docs, blocks) [y/N] ')
  const includeBoilerplate = answer === 'y' || answer === 'yes'

  scaffold(projectName, { includeBoilerplate })
}

main()
