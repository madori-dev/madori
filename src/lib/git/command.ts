import { spawn } from 'child_process'
import { GitCommandError, GitError } from './errors'

export function redactGitText(value: string): string {
  return value
    .replace(/([a-z]+:\/\/)[^\s/@]+@/gi, '$1***@')
    .replace(/(Authorization:\s*(?:Bearer|Basic)\s+)[^\s]+/gi, '$1***')
    .replace(/([?&](?:access_token|token|key|secret|password)=)[^&#\s]+/gi, '$1***')
    .replace(/\b(?:ghp|gho|github_pat|glpat|xoxb)-?[A-Za-z0-9_=-]{8,}\b/g, '***')
}

export interface GitCommandOptions { cwd: string; timeoutMs?: number; env?: Partial<NodeJS.ProcessEnv> }

/** Execute git without a shell; arguments are never interpolated. */
export async function runGit(args: string[], options: GitCommandOptions): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 30_000
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
      env: { ...process.env, ...options.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM') }, timeoutMs)
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', error => {
      clearTimeout(timer)
      reject(new GitError(`Unable to execute Git: ${error.message}`, 'GIT_UNAVAILABLE'))
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (timedOut) return reject(new GitError(`Git command timed out after ${timeoutMs}ms`, 'TIMEOUT'))
      if (code !== 0) return reject(new GitCommandError(`Git command failed (${code ?? 'signal'})`, code, redactGitText(stderr.trim())))
      resolve(stdout)
    })
  })
}
