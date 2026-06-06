#!/usr/bin/env node

import { Command } from 'commander'
import { registerMakeUser } from './commands/make-user.js'
import { registerMigrateDefinitions } from './commands/migrate-definitions.js'
import { registerCheck } from './commands/check.js'
import { registerMakeBlueprint } from './commands/make-blueprint.js'
import { registerMakeCollection } from './commands/make-collection.js'
import { registerMigrateWordpress } from './commands/migrate-wordpress.js'
import { registerRegistryPull } from './commands/registry-pull.js'
import { registerRegistryPush } from './commands/registry-push.js'
import { registerExport } from './commands/export.js'
import { registerImport } from './commands/import.js'
import { registerInitPreset } from './commands/init-preset.js'
import { registerMigrateMarkdown } from './commands/migrate-markdown.js'
import { registerGenerate } from './commands/generate.js'

const program = new Command()

program
  .name('madori')
  .description('MADORI CMS command-line tools')
  .version('0.1.0')

program.showHelpAfterError(true)

registerMakeUser(program)
registerMigrateDefinitions(program)
registerCheck(program)
registerMakeBlueprint(program)
registerMakeCollection(program)
registerMigrateWordpress(program)
registerExport(program)
registerImport(program)
registerMigrateMarkdown(program)
registerRegistryPull(program)
registerRegistryPush(program)
registerInitPreset(program)
registerGenerate(program)

program.parseAsync(process.argv).catch((error: Error) => {
  console.error(`Error: ${error.message}`)
  process.exitCode = 1
})
