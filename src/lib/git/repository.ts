import path from 'path'
import { randomUUID } from 'crypto'
import { access, realpath, stat, unlink } from 'fs/promises'
import { GitCommandError, GitError } from './errors'
import { runGit } from './command'
import type { GitAuthor, GitFileStatus, GitRepository, GitStatusEntry } from './types'

const statusFor = (index: string, workingTree: string): GitFileStatus => {
  const value = `${index}${workingTree}`
  if (value.includes('D')) return 'deleted'
  if (value.includes('R') || value.includes('C')) return 'renamed'
  if (value.includes('A')) return 'added'
  if (value === '??') return 'untracked'
  if (value.includes('M')) return 'modified'
  return 'unknown'
}

export function sanitiseRemote(remote: string): string {
  try {
    const url = new URL(remote)
    if (url.password) url.password = '***'
    if (url.username) url.username = '***'
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    // Covers SCP-style remotes too (for example token@host:path). Hiding an
    // SSH username is preferable to ever returning a token-like credential.
    return remote.replace(/^([^@\s/]+)@/, '***@').replace(/:\/\/[^@/]+@/, '://***@')
  }
}

export function validateGitValue(value: string, label: string): void {
  if (!value || /[\0\r\n]/.test(value) || value.startsWith('-')) throw new GitError(`Invalid Git ${label}`, 'INVALID_INPUT')
}

export function validateGitAuthor(author: GitAuthor): void {
  validateGitValue(author.name, 'author name')
  validateGitValue(author.email, 'author email')
  if (!/^[^\s@]+@[^\s@]+$/.test(author.email)) throw new GitError('Invalid Git author email', 'INVALID_INPUT')
}

export async function findRepositoryRoot(filePath: string, timeoutMs?: number): Promise<string | null> {
  let cwd = path.resolve(filePath)
  try {
    cwd = await realpath(cwd)
    if (!(await stat(cwd)).isDirectory()) cwd = path.dirname(cwd)
  } catch { cwd = path.dirname(cwd) }
  while (true) {
    try { return await realpath((await runGit(['rev-parse', '--show-toplevel'], { cwd, timeoutMs })).trim()) } catch (error) {
      if (!(error instanceof GitCommandError)) throw error
      const parent = path.dirname(cwd)
      if (parent === cwd) return null
      cwd = parent
    }
  }
}

export async function groupPathsByRepository(paths: string[], timeoutMs?: number): Promise<Map<string, string[]>> {
  const grouped = new Map<string, string[]>()
  for (const filePath of paths) {
    const root = await findRepositoryRoot(filePath, timeoutMs)
    if (!root) continue
    let absolute = path.resolve(filePath)
    try { absolute = await realpath(absolute) } catch {
      try { absolute = path.join(await realpath(path.dirname(absolute)), path.basename(absolute)) } catch { /* retain lexical path */ }
    }
    const relative = path.relative(root, absolute)
    if (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
      const existing = grouped.get(root) ?? []
      const scopedPath = relative || '.'
      if (!existing.includes(scopedPath)) existing.push(scopedPath)
      grouped.set(root, existing)
    }
  }
  return grouped
}

export async function inspectRepository(root: string, remoteName = 'origin', timeoutMs?: number): Promise<GitRepository> {
  validateGitValue(remoteName, 'remote')
  const branch = await runGit(['branch', '--show-current'], { cwd: root, timeoutMs }).then(value => value.trim() || null)
  const remote = await runGit(['remote', 'get-url', remoteName], { cwd: root, timeoutMs }).then(value => value.trim()).catch(error => {
    if (error instanceof GitCommandError) return null
    throw error
  })
  return { root, branch, remote: remote ? sanitiseRemote(remote) : null }
}

export async function getScopedStatus(root: string, paths: string[], timeoutMs?: number): Promise<GitStatusEntry[]> {
  if (!paths.length) return []
  const output = await runGit(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...paths], { cwd: root, timeoutMs })
  const parts = output.split('\0').filter(Boolean)
  const entries: GitStatusEntry[] = []
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]
    const xy = part.slice(0, 2)
    const filePath = part.slice(3)
    const originalPath = xy[0] === 'R' || xy[0] === 'C' ? parts[++index] : undefined
    entries.push({ path: filePath, originalPath, index: xy[0], workingTree: xy[1], status: statusFor(xy[0], xy[1]) })
  }
  return entries
}

export async function stagePaths(root: string, paths: string[], timeoutMs?: number): Promise<void> {
  const candidates: string[] = []
  for (const item of paths) {
    const exists = await access(path.join(root, item)).then(() => true).catch(() => false)
    const indexed = exists ? false : await runGit(['ls-files', '--error-unmatch', '--', item], { cwd: root, timeoutMs })
      .then(() => true)
      .catch(error => error instanceof GitCommandError ? false : Promise.reject(error))
    // Missing paths already removed from index (for example by `git mv`) are
    // already staged and must not make the scoped add fail.
    if (exists || indexed) candidates.push(item)
  }
  if (candidates.length) await runGit(['add', '-A', '--', ...candidates], { cwd: root, timeoutMs })
}

export async function commitStaged(root: string, message: string, author?: GitAuthor, coAuthors: GitAuthor[] = [], timeoutMs?: number, paths?: string[]): Promise<string | null> {
  if (/[\0\r\n]/.test(message)) throw new GitError('Invalid Git commit message', 'INVALID_INPUT')
  if (!paths?.length) throw new GitError('Scoped paths are required for Git commits', 'INVALID_INPUT')
  if (author) validateGitAuthor(author)
  coAuthors.forEach(validateGitAuthor)
  const pathspec = ['--', ...paths]
  const staged = await runGit(['diff', '--cached', '--quiet', ...pathspec], { cwd: root, timeoutMs }).then(() => false).catch(error => {
    if (error instanceof GitCommandError && error.exitCode === 1) return true
    throw error
  })
  if (!staged) return null
  const indexPath = await runGit(['rev-parse', '--git-path', 'index'], { cwd: root, timeoutMs })
    .then(value => path.resolve(root, value.trim()))
  const temporaryIndex = `${indexPath}.madori-${process.pid}-${randomUUID()}`
  const env = { GIT_INDEX_FILE: temporaryIndex }
  try {
    const hasHead = await runGit(['rev-parse', '--verify', 'HEAD'], { cwd: root, timeoutMs })
      .then(() => true)
      .catch(error => error instanceof GitCommandError ? false : Promise.reject(error))
    await runGit(hasHead ? ['read-tree', 'HEAD'] : ['read-tree', '--empty'], { cwd: root, timeoutMs, env })
    await runGit(['add', '-A', '--', ...paths], { cwd: root, timeoutMs, env })

    const trailers = coAuthors.map(value => `Co-authored-by: ${value.name} <${value.email}>`)
    const args = ['commit', '-m', message, ...trailers.flatMap(value => ['-m', value])]
    if (author) args.push(`--author=${author.name} <${author.email}>`)
    await runGit(args, { cwd: root, timeoutMs, env })
    return (await runGit(['rev-parse', 'HEAD'], { cwd: root, timeoutMs })).trim()
  } finally {
    await unlink(temporaryIndex).catch(() => undefined)
  }
}

export async function pushRepository(root: string, remote = 'origin', branch?: string, timeoutMs?: number): Promise<void> {
  validateGitValue(remote, 'remote')
  if (branch) validateGitValue(branch, 'branch')
  const target = branch ?? (await runGit(['branch', '--show-current'], { cwd: root, timeoutMs })).trim()
  if (!target) throw new GitError('Cannot push detached HEAD', 'NO_BRANCH')
  try { await runGit(['push', remote, target], { cwd: root, timeoutMs }) } catch (error) {
    if (error instanceof GitCommandError) throw new GitError('Git push failed', 'PUSH_FAILED', error.details)
    throw error
  }
}
