import { createHash } from 'crypto'
import { realpathSync } from 'fs'
import { realpath } from 'fs/promises'
import path from 'path'
import type { MadoriConfig } from '@/lib/config/schema'
import type { ContentMutation, ContentMutationReporter } from '@/lib/mutations'
import { GitSyncCoordinator } from './coordinator'
import { GitError } from './errors'
import { findRepositoryRoot, getScopedStatus, inspectRepository } from './repository'
import type { GitMutation, GitRepositoryStatus, GitStatusEntry, GitSyncResult } from './types'

type TrackedRoot = { path: string; excludes: readonly string[]; label: string }
type RepositoryTarget = { root: string; paths: string[]; label: string }
export type GitSyncResponse = { repository: string; committed: boolean; commit?: string; pushed: boolean; pendingPush: boolean; pathCount: number }

const normalise = (value: string) => value.replace(/\\/g, '/')
const runtimePath = (base: string, value: string) => path.isAbsolute(value)
  ? value
  : `${base.replace(/[\\/]$/, '')}/${value}`

function globMatches(value: string, pattern: string): boolean {
  // Config patterns are matched only against a root-relative path. This avoids
  // allowing an exclude to reach outside its configured root.
  const escaped = normalise(pattern).replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    .replace(/\*\*/g, '::GLOBSTAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::GLOBSTAR::/g, '.*')
  return new RegExp(`^${escaped}$`).test(normalise(value))
}

function contains(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function canonicalPath(value: string): string {
  const absolute = path.resolve(value)
  try { return realpathSync(absolute) }
  catch {
    try { return path.join(realpathSync(path.dirname(absolute)), path.basename(absolute)) }
    catch { return absolute }
  }
}

export class GitSyncRuntime {
  private readonly roots: TrackedRoot[]
  private readonly coordinator: GitSyncCoordinator
  private readonly knownTargets = new Map<string, RepositoryTarget>()
  private readonly ignoredUntil = new Map<string, number>()
  private unsubscribe?: () => void
  private readonly errors = new Map<string, string>()

  constructor(private readonly config: MadoriConfig, projectRoot: string) {
    const rootFor = (root: string) => {
      const builtins: Record<string, string> = {
        content: config.contentPath, resources: config.resourcesPath,
        assets: config.assetsPath, users: config.usersPath,
      }
      return builtins[root] ?? runtimePath(projectRoot, root)
    }
    this.roots = config.git.trackedPaths.map((item) => ({
      path: rootFor(item.root), excludes: item.exclude,
      label: typeof item.root === 'string' && ['content', 'resources', 'assets', 'users'].includes(item.root)
        ? item.root[0].toUpperCase() + item.root.slice(1) : path.basename(rootFor(item.root)),
    }))
    this.coordinator = new GitSyncCoordinator({
      statePath: runtimePath(projectRoot, config.git.statePath), debounceMs: config.git.debounceMs,
      lockTimeoutMs: config.git.lockTimeoutMs, push: config.git.push, remote: config.git.remote,
      branch: config.git.branch, commandTimeoutMs: config.git.commandTimeoutMs,
      commitPrefix: config.git.commitPrefix, botAuthor: { name: config.git.author.name, email: config.git.author.email },
    })
  }

  get enabled(): boolean { return this.config.git.enabled }

  async start(reporter: ContentMutationReporter): Promise<void> {
    if (!this.enabled || this.unsubscribe) return
    this.unsubscribe = reporter.onMutation((mutation) => { void this.reportMutation(mutation) })
    await this.refreshTargets()
    await this.coordinator.restore().catch((error) => this.captureError(error))
    if (this.config.git.automatic) void this.coordinator.syncAll().catch((error) => this.captureError(error))
  }

  stop(): void { this.unsubscribe?.(); this.unsubscribe = undefined; this.coordinator.stop() }

  async reportMutation(mutation: ContentMutation): Promise<void> {
    if (!this.enabled || !this.config.git.automatic) return
    const author = this.config.git.author.useAuthenticated && mutation.actor?.name && mutation.actor.email
      ? { name: mutation.actor.name, email: mutation.actor.email } : undefined
    for (const item of mutation.paths) this.ignoredUntil.set(path.resolve(item), Date.now() + 5_000)
    await this.enqueue({ paths: [...mutation.paths], message: mutation.message, author })
  }

  /** Catch external edits. Semantic writes have a short suppression window. */
  async reportFilesystemChange(filePath: string): Promise<void> {
    if (!this.enabled || !this.config.git.automatic) return
    const absolute = path.resolve(filePath)
    if ((this.ignoredUntil.get(absolute) ?? 0) > Date.now()) return
    await this.enqueue({ paths: [absolute], message: 'Updated content from filesystem' })
  }

  private async enqueue(mutation: GitMutation): Promise<void> {
    try {
      const paths = await this.concreteTrackedPaths(mutation.paths)
      if (!paths.length) return
      await this.coordinator.enqueue({ ...mutation, paths })
    }
    catch (error) { this.captureError(error) }
  }

  /**
   * Never pass a reported directory to Git. Resolve it through porcelain first
   * so excludes are applied to every actual file, including rename sources and
   * deleted descendants that no longer exist on disk.
   */
  private async concreteTrackedPaths(paths: readonly string[]): Promise<string[]> {
    const groups = await Promise.all(paths.map(async (filePath) => {
      const absolute = canonicalPath(filePath)
      if (!this.isTracked(absolute)) return []
      const repository = await findRepositoryRoot(absolute, this.config.git.commandTimeoutMs)
      if (!repository) return []
      const scoped = path.relative(repository, absolute) || '.'
      const entries = await getScopedStatus(repository, [scoped], this.config.git.commandTimeoutMs)
      return entries.flatMap((entry) => [entry.path, entry.originalPath]
        .filter((item): item is string => Boolean(item))
        .map((item) => path.join(repository, item))
        .filter((item) => this.isTracked(item)))
    }))
    return [...new Set(groups.flat())]
  }

  private isTracked(filePath: string): boolean {
    const absolute = canonicalPath(filePath)
    return this.roots.some((root) => {
      if (!contains(root.path, absolute)) return false
      const relative = normalise(path.relative(root.path, absolute))
      return !root.excludes.some((pattern) => globMatches(relative, pattern))
    })
  }

  private async refreshTargets(): Promise<RepositoryTarget[]> {
    const targets = new Map<string, RepositoryTarget>()
    for (const tracked of this.roots) {
      // Git returns canonical roots on platforms with symlinked temp paths.
      // Canonicalise configured roots as well so `git -- path` remains scoped.
      tracked.path = await realpath(tracked.path).catch(() => tracked.path)
      const repository = await findRepositoryRoot(tracked.path, this.config.git.commandTimeoutMs).catch(() => null)
      if (!repository) continue
      const scoped = path.relative(repository, tracked.path) || '.'
      const target = targets.get(repository) ?? { root: repository, paths: [], label: tracked.label }
      if (!target.paths.includes(scoped)) target.paths.push(scoped)
      targets.set(repository, target)
    }
    this.knownTargets.clear()
    for (const target of targets.values()) this.knownTargets.set(target.root, target)
    return [...targets.values()]
  }

  private id(root: string): string { return createHash('sha256').update(root).digest('hex') }
  private targetFor(id: string): RepositoryTarget | undefined {
    return [...this.knownTargets.values()].find((target) => this.id(target.root) === id)
  }

  async status(): Promise<GitRepositoryStatus[]> {
    if (!this.enabled) return []
    const targets = await this.refreshTargets()
    const pending = new Map((await this.coordinator.listPending()).map((item) => [item.id, item]))
    return Promise.all(targets.map(async (target) => {
      try {
        const [repository, entries] = await Promise.all([
          inspectRepository(target.root, this.config.git.remote, this.config.git.commandTimeoutMs),
          this.statusEntries(target),
        ])
        const counts = count(entries)
        const pendingState = pending.get(this.id(target.root))
        const error = this.errors.get(target.root) ?? pendingState?.lastError ?? null
        return { id: this.id(target.root), label: target.label, branch: repository.branch, remote: repository.remote,
          status: error ? 'failed' : entries.length || pendingState ? 'pending' : 'clean', counts, error,
          canSync: true, canRetry: Boolean(error || pendingState?.pendingPush) } satisfies GitRepositoryStatus
      } catch (error) {
        const message = safeError(error)
        this.errors.set(target.root, message)
        return { id: this.id(target.root), label: target.label, branch: null, remote: null, status: 'failed',
          counts: { added: 0, modified: 0, deleted: 0 }, error: message, canSync: true, canRetry: true } satisfies GitRepositoryStatus
      }
    }))
  }

  async sync(id?: string): Promise<GitSyncResponse[]> {
    if (!this.enabled) throw new GitError('Git synchronization is disabled', 'DISABLED')
    await this.refreshTargets()
    const targets = id ? [this.targetFor(id)].filter((value): value is RepositoryTarget => Boolean(value)) : [...this.knownTargets.values()]
    if (id && !targets.length) throw new GitError('Unknown Git repository', 'UNKNOWN_REPOSITORY')
    return Promise.all(targets.map(async (target) => {
      const entries = await this.statusEntries(target)
      if (entries.length) await this.coordinator.enqueue({
        paths: entries.flatMap((entry) => [entry.path, entry.originalPath].filter((value): value is string => Boolean(value)).map((value) => path.join(target.root, value))),
        message: 'Manual Git sync',
      })
      try { const result = await this.coordinator.sync(target.root); this.errors.delete(target.root); return this.present(result) }
      catch (error) { this.captureError(error, target.root); throw error }
    }))
  }

  async retry(id: string): Promise<GitSyncResponse> {
    if (!this.enabled) throw new GitError('Git synchronization is disabled', 'DISABLED')
    await this.refreshTargets()
    const target = this.targetFor(id)
    if (!target) throw new GitError('Unknown Git repository', 'UNKNOWN_REPOSITORY')
    try { const result = await this.coordinator.retryPush(this.id(target.root)); this.errors.delete(target.root); return this.present(result) }
    catch (error) { this.captureError(error, target.root); throw error }
  }

  private async statusEntries(target: RepositoryTarget): Promise<GitStatusEntry[]> {
    const entries = await getScopedStatus(target.root, target.paths, this.config.git.commandTimeoutMs)
    return entries.filter((entry) => this.isTracked(path.join(target.root, entry.path)))
  }
  private captureError(error: unknown, root?: string): void {
    if (root) this.errors.set(root, safeError(error))
  }
  private present(result: GitSyncResult): GitSyncResponse {
    return { repository: this.id(result.repository), committed: result.committed, commit: result.commit,
      pushed: result.pushed, pendingPush: result.pendingPush, pathCount: result.paths.length }
  }
}

function count(entries: GitStatusEntry[]): { added: number; modified: number; deleted: number } {
  return entries.reduce((counts, entry) => {
    if (entry.status === 'deleted') counts.deleted++
    else if (entry.status === 'added' || entry.status === 'untracked') counts.added++
    else counts.modified++
    return counts
  }, { added: 0, modified: 0, deleted: 0 })
}

function safeError(error: unknown): string {
  return error instanceof GitError ? error.message : 'Git synchronization failed'
}
