import { describe, it, expect } from 'vitest'
import { execFileSync, type ExecSyncOptionsWithBufferEncoding } from 'child_process'
import path from 'path'

const CLI_ENTRY = path.resolve(__dirname, '../../../packages/madori-cli/src/index.ts')

function runCli(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const cmd = 'npx'
  const cmdArgs = ['tsx', CLI_ENTRY, ...args]
  const opts: ExecSyncOptionsWithBufferEncoding = {
    cwd: path.resolve(__dirname, '../../../'),
    encoding: 'utf-8' as BufferEncoding,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  }

  try {
    const stdout = execFileSync(cmd, cmdArgs, { ...opts, stdio: ['pipe', 'pipe', 'pipe'] }) as unknown as string
    return { stdout: stdout ?? '', stderr: '', exitCode: 0 }
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; status?: number }
    return {
      stdout: (execError.stdout ?? '').toString(),
      stderr: (execError.stderr ?? '').toString(),
      exitCode: execError.status ?? 1,
    }
  }
}

describe('CLI entry point', () => {
  describe('--help flag', () => {
    it('displays available commands including make:user', () => {
      const result = runCli(['--help'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('make:user')
      expect(result.stdout).toContain('MADORI CMS command-line tools')
    })

    it('displays available commands including migrate:definitions', () => {
      const result = runCli(['--help'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('migrate:definitions')
    })

    it('displays usage information for make:user --help', () => {
      const result = runCli(['make:user', '--help'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Create a new user account')
    })

    it('displays usage information for migrate:definitions --help', () => {
      const result = runCli(['migrate:definitions', '--help'])

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('--config')
      expect(result.stdout).toContain('--resources')
    })
  })

  describe('unrecognized command', () => {
    it('produces an error message for unknown commands', () => {
      const result = runCli(['nonexistent-command'])

      expect(result.exitCode).toBe(1)
      const output = result.stdout + result.stderr
      expect(output).toMatch(/unknown command|error/i)
    })
  })

  describe('exit codes', () => {
    it('exits with code 1 on command failure', () => {
      const result = runCli(['nonexistent-command'])

      expect(result.exitCode).toBe(1)
    })
  })
})
