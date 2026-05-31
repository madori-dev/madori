import type { Command } from 'commander'
import { promptForUserDetails } from '../prompts/user-prompts.js'
import { resolveUsersPath } from '../utils/resolve-paths.js'
import { NodeFileSystemAdapter } from '../../../../src/lib/fs/adapter.js'
import { MarkdownYamlParser } from '../../../../src/lib/fs/parser.js'
import { YamlUserProvider } from '../../../../src/lib/auth/providers/yaml.js'

export function registerMakeUser(program: Command): void {
  program
    .command('make:user')
    .description('Create a new user account')
    .action(async () => {
      try {
        const usersPath = resolveUsersPath()
        const fs = new NodeFileSystemAdapter()
        const parser = new MarkdownYamlParser()
        const provider = new YamlUserProvider(usersPath, fs, parser)

        const details = await promptForUserDetails()

        // Check for duplicate by email
        const existingByEmail = await provider.getByEmail(details.email)
        if (existingByEmail) {
          console.error(`Error: A user with email "${details.email}" already exists.`)
          process.exitCode = 1
          return
        }

        // Create user (handles password hashing internally)
        const user = await provider.create({
          id: details.id,
          email: details.email,
          name: details.name,
          password: details.password,
          roles: details.roles,
        })

        const filePath = `users/${user.id}.yaml`
        console.log(`✓ User created: ${filePath}`)
      } catch (error) {
        // Handle graceful Ctrl+C cancellation
        if (error instanceof Error && error.name === 'ExitPromptError') {
          return
        }
        throw error
      }
    })
}
