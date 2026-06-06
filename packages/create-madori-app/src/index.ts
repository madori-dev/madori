#!/usr/bin/env node

import * as fs from 'node:fs'
import * as readline from 'node:readline'
import * as path from 'node:path'
import { scaffold } from './scaffold.js'
import { AVAILABLE_STARTERS, isValidStarter, downloadStarter } from './starters.js'

const args = process.argv.slice(2)

// Parse --starter flag
let starterFlag: string | undefined
const starterIndex = args.indexOf('--starter')
if (starterIndex !== -1) {
  starterFlag = args[starterIndex + 1]
  args.splice(starterIndex, 2)
}

const projectName = args[0]

if (!projectName) {
  console.error('Usage: create-madori-app <project-name> [--starter <name>]')
  console.error('')
  console.error('Example:')
  console.error('  pnpm dlx create-madori-app my-site')
  console.error('  pnpm dlx create-madori-app my-site --starter agency')
  console.error('')
  console.error('Available starters: ' + AVAILABLE_STARTERS.join(', '))
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

function printNextSteps(): void {
  console.log(`
  Next steps:

    cd ${projectName}
    pnpm install
    pnpm dev
`)
}

function directoryHasFiles(dir: string): boolean {
  if (!fs.existsSync(dir)) return false
  const entries = fs.readdirSync(dir)
  return entries.length > 0
}

async function handleStarterFlag(starter: string): Promise<void> {
  if (!isValidStarter(starter)) {
    console.error(`\n  ✗ Unknown starter "${starter}".`)
    console.error(`  Available starters: ${AVAILABLE_STARTERS.join(', ')}`)
    process.exit(1)
  }

  const projectDir = path.resolve(process.cwd(), projectName)

  if (fs.existsSync(projectDir)) {
    console.error(`Error: Directory "${projectName}" already exists.`)
    process.exit(1)
  }

  console.log(`\n  Creating MADORI project: ${projectName} (starter: ${starter})\n`)
  console.log('  ⬇ Downloading starter package...')

  await downloadStarter(starter, projectDir)

  if (!directoryHasFiles(projectDir)) {
    console.warn('  ⚠ Starter download produced no files. Falling back to blank project.')
    scaffold(projectName, { includeBoilerplate: false })
    return
  }

  console.log(`  ✓ Starter "${starter}" downloaded successfully`)
  printNextSteps()
}

async function handleInteractiveSelection(): Promise<void> {
  console.log('\n  Select a project template:\n')

  AVAILABLE_STARTERS.forEach((starter, index) => {
    console.log(`    ${index + 1}) ${starter}`)
  })
  console.log(`    ${AVAILABLE_STARTERS.length + 1}) blank project`)
  console.log('')

  const answer = await ask(`  Enter choice [1-${AVAILABLE_STARTERS.length + 1}]: `)
  const choice = parseInt(answer, 10)

  if (choice >= 1 && choice <= AVAILABLE_STARTERS.length) {
    const starter = AVAILABLE_STARTERS[choice - 1]
    await handleStarterFlag(starter)
  } else if (choice === AVAILABLE_STARTERS.length + 1 || answer === '') {
    // Blank project — ask about boilerplate as before
    const boilerplateAnswer = await ask(
      '\n  Include the boilerplate site? (homepage, docs, blocks) [y/N] '
    )
    const includeBoilerplate = boilerplateAnswer === 'y' || boilerplateAnswer === 'yes'
    scaffold(projectName, { includeBoilerplate })
  } else {
    console.error('\n  ✗ Invalid selection.')
    process.exit(1)
  }
}

async function main() {
  if (starterFlag) {
    await handleStarterFlag(starterFlag)
  } else {
    await handleInteractiveSelection()
  }
}

main()
