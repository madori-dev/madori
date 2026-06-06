import type { Command } from 'commander'
import { confirm } from '@inquirer/prompts'
import { AVAILABLE_PRESETS, isValidPreset, applyPreset } from '../generators/preset-generator.js'

export function registerInitPreset(program: Command): void {
  program
    .command('init:preset <preset-name>')
    .description('Initialise project with an opinionated preset structure')
    .option('--force', 'Skip conflict prompts and overwrite existing resources')
    .action(async (presetName: string, options: { force?: boolean }) => {
      try {
        if (!isValidPreset(presetName)) {
          console.error(`\nError: Unknown preset "${presetName}". Available presets:\n`)
          for (const name of AVAILABLE_PRESETS) {
            console.error(`  - ${name}`)
          }
          console.error()
          process.exitCode = 1
          return
        }

        const result = await applyPreset(presetName)

        if (result.conflicts.length > 0 && !options.force) {
          console.log('\nThe following files already exist and would be overwritten:\n')
          for (const file of result.conflicts) {
            console.log(`  - ${file}`)
          }
          console.log()

          const confirmed = await confirm({
            message: 'Overwrite existing resources?',
            default: false,
          })

          if (!confirmed) {
            console.log('\nAborted.\n')
            return
          }

          const forceResult = await applyPreset(presetName, { force: true })

          console.log(`\n✓ Preset "${presetName}" applied successfully!\n`)
          console.log('Files created:')
          for (const file of forceResult.filesCreated) {
            console.log(`  - ${file}`)
          }
          console.log('\nNext steps:')
          console.log('  Run `madori check` to validate your project.\n')
          return
        }

        console.log(`\n✓ Preset "${presetName}" applied successfully!\n`)
        console.log('Files created:')
        for (const file of result.filesCreated) {
          console.log(`  - ${file}`)
        }
        console.log('\nNext steps:')
        console.log('  Run `madori check` to validate your project.\n')
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`\nError: ${message}\n`)
        process.exitCode = 1
      }
    })
}
