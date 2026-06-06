import type { Command } from 'commander'
import { registryPull } from '../portability/registry-client.js'
import type { RegistryConfig } from '../portability/registry-client.js'

export function registerRegistryPull(program: Command): void {
  program
    .command('registry:pull <repository-url>')
    .description('Pull resources from a shared Git registry into the local project')
    .option('--resources <types>', 'Comma-separated resource types to pull (blueprints,collections,fieldsets)')
    .option('--branch <branch>', 'Git branch to pull from', 'main')
    .action(async (repositoryUrl: string, options: { resources?: string; branch: string }) => {
      const config: RegistryConfig = {
        url: repositoryUrl,
        branch: options.branch,
        resources: options.resources
          ? options.resources.split(',').map((r) => r.trim())
          : undefined,
      }

      try {
        const result = await registryPull(config)

        console.log('✓ Registry pull complete')
        console.log(`  Pulled:    ${result.pulled}`)
        console.log(`  Skipped:   ${result.skipped}`)
        console.log(`  Conflicts: ${result.conflicts}`)
        console.log('')
        console.log(`Tip: Add \`registry: { url: '${repositoryUrl}' }\` to your madori.config.ts for future operations.`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`✗ ${message}`)
        process.exitCode = 1
      }
    })
}
