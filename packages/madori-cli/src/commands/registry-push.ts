import type { Command } from 'commander'
import { registryPush } from '../portability/registry-client.js'
import type { RegistryConfig } from '../portability/registry-client.js'

export function registerRegistryPush(program: Command): void {
  program
    .command('registry:push <repository-url>')
    .description('Push local resources to a shared Git registry')
    .option('--resources <types>', 'Comma-separated resource types to push (blueprints,collections,fieldsets)')
    .option('--branch <branch>', 'Git branch to push to', 'main')
    .action(async (repositoryUrl: string, options: { resources?: string; branch: string }) => {
      const config: RegistryConfig = {
        url: repositoryUrl,
        branch: options.branch,
        resources: options.resources
          ? options.resources.split(',').map((r) => r.trim())
          : undefined,
      }

      try {
        const result = await registryPush(config)

        console.log('✓ Registry push complete')
        console.log(`  Pushed: ${result.pushed}`)
        console.log('')
        console.log(`Tip: Add \`registry: { url: '${repositoryUrl}' }\` to your madori.config.ts for future operations.`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`✗ ${message}`)
        process.exitCode = 1
      }
    })
}
