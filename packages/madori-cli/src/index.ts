#!/usr/bin/env node

import { Command } from 'commander'
import { registerMakeUser } from './commands/make-user.js'
import { registerMigrateDefinitions } from './commands/migrate-definitions.js'

const program = new Command()

program
  .name('madori')
  .description('MADORI CMS command-line tools')
  .version('0.1.0')

program.showHelpAfterError(true)

registerMakeUser(program)
registerMigrateDefinitions(program)

program.parseAsync(process.argv).catch((error: Error) => {
  console.error(`Error: ${error.message}`)
  process.exitCode = 1
})
