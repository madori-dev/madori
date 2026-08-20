import type { Command } from 'commander'
import { loadConfig, resolveConfigPaths } from '../../../../src/lib/config/loader.js'
import { GitSyncRuntime } from '../../../../src/lib/git/runtime.js'
import { ContentMutationBus } from '../../../../src/lib/mutations/index.js'

async function runtime(): Promise<GitSyncRuntime> {
  const root = process.cwd()
  const config = resolveConfigPaths(await loadConfig(root), root)
  const service = new GitSyncRuntime(config, root)
  await service.start(new ContentMutationBus())
  return service
}

function print(value: unknown): void {
  // Runtime statuses contain only opaque IDs and sanitized remotes.
  console.log(JSON.stringify(value, null, 2))
}

export function registerGit(program: Command): void {
  const git = program.command('git').description('Inspect and synchronize configured content repositories')

  git.command('status').description('Show safe status for configured Git repositories').action(async () => {
    const service = await runtime()
    if (!service.enabled) {
      console.log('Git synchronization is disabled.')
      return
    }
    print(await service.status())
  })

  git.command('sync').description('Commit pending changes in configured Git repositories').option('--repository <id>', 'Opaque repository ID from git:status').action(async (options: { repository?: string }) => {
    const service = await runtime()
    print(await service.sync(options.repository))
  })

  git.command('retry').description('Retry a pending push').requiredOption('--repository <id>', 'Opaque repository ID from git:status').action(async (options: { repository: string }) => {
    const service = await runtime()
    print(await service.retry(options.repository))
  })

  // Keep documented colon commands alongside grouped subcommands.
  program.command('git:status').description('Show safe status for configured Git repositories').action(async () => {
    const service = await runtime()
    if (!service.enabled) return console.log('Git synchronization is disabled.')
    print(await service.status())
  })
  program.command('git:sync').description('Commit pending changes in configured Git repositories').option('--repository <id>', 'Opaque repository ID from git:status').action(async (options: { repository?: string }) => {
    print(await (await runtime()).sync(options.repository))
  })
  program.command('git:retry').description('Retry a pending push').requiredOption('--repository <id>', 'Opaque repository ID from git:status').action(async (options: { repository: string }) => {
    print(await (await runtime()).retry(options.repository))
  })
}
