import { createHash } from 'crypto'
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'fs/promises'
import path from 'path'
import { redactGitText } from './command'
import { commitStaged, groupPathsByRepository, inspectRepository, pushRepository, stagePaths, validateGitAuthor, validateGitValue } from './repository'
import { withRepositoryLock } from './lock'
import type { GitAuthor, GitCoordinatorOptions, GitMutation, GitPendingStatus, GitSyncResult } from './types'

interface PendingWork { repository?: string; paths: string[]; messages: string[]; authors: GitAuthor[]; pushPending: boolean; lastError?: string | null }
const identity = (author: GitAuthor) => `${author.name}\u0000${author.email}`

function isSafeScopedPath(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value === '.' || /[\0\r\n]/.test(value) || path.isAbsolute(value)) return false
  const relative = path.relative('.', value)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

/** State is durable input: validate it before it can select a repository or Git pathspec. */
function decodePendingWork(value: unknown, expectedId?: string): PendingWork | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const work = value as Record<string, unknown>
  if (typeof work.repository !== 'string' || !path.isAbsolute(work.repository) || /[\0\r\n]/.test(work.repository)) return null
  if (expectedId && createHash('sha256').update(work.repository).digest('hex') !== expectedId) return null
  if (!Array.isArray(work.paths) || !work.paths.every(isSafeScopedPath)) return null
  if (!Array.isArray(work.messages) || !work.messages.every((message) => typeof message === 'string' && message.length > 0 && !/[\0\r\n]/.test(message))) return null
  if (!Array.isArray(work.authors) || !work.authors.every((author) => {
    try { validateGitAuthor(author as GitAuthor); return true } catch { return false }
  })) return null
  if (typeof work.pushPending !== 'boolean' || (work.lastError !== undefined && work.lastError !== null && typeof work.lastError !== 'string')) return null
  return work as unknown as PendingWork
}

export class GitSyncCoordinator {
  private readonly pending = new Map<string, PendingWork>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private enqueueChain: Promise<void> = Promise.resolve()
  private stopped = false
  private readonly debounceMs: number
  constructor(private readonly options: GitCoordinatorOptions) {
    this.debounceMs = options.debounceMs ?? 2_000
    if ((options.commandTimeoutMs ?? 30_000) <= 0) throw new Error('Git command timeout must be positive')
    if ((options.staleLockMs ?? 300_000) < (options.commandTimeoutMs ?? 30_000)) throw new Error('Git stale lock timeout must exceed command timeout')
    if (options.remote) validateGitValue(options.remote, 'remote')
    if (options.branch) validateGitValue(options.branch, 'branch')
    if (options.botAuthor) validateGitAuthor(options.botAuthor)
    if (options.commitPrefix && /[\0\r\n]/.test(options.commitPrefix)) throw new Error('Invalid Git commit prefix')
  }

  async enqueue(mutation: GitMutation): Promise<void> {
    if (this.stopped) throw new Error('Git sync coordinator is stopped')
    if (!mutation.message || /[\0\r\n]/.test(mutation.message)) throw new Error('Invalid Git mutation message')
    if (mutation.author) validateGitAuthor(mutation.author)
    const operation = this.enqueueChain.then(() => this.addMutation(mutation))
    this.enqueueChain = operation.catch(() => undefined)
    return operation
  }

  private async addMutation(mutation: GitMutation): Promise<void> {
    const groups = await groupPathsByRepository(mutation.paths, this.options.commandTimeoutMs)
    await Promise.all([...groups].map(async ([root, paths]) => {
      await this.lock(root, async () => {
        // Disk state is authoritative: other Node processes may have enqueued since this process last read it.
        const work = await this.read(root) ?? { paths: [], messages: [], authors: [], pushPending: false }
        for (const item of paths) if (!work.paths.includes(item)) work.paths.push(item)
        const isGenericManualSync = mutation.message === 'Manual Git sync'
        if ((!isGenericManualSync || work.messages.length === 0) && !work.messages.includes(mutation.message)) work.messages.push(mutation.message)
        if (mutation.author && !work.authors.some(author => identity(author) === identity(mutation.author!))) work.authors.push(mutation.author)
        work.lastError = null
        this.pending.set(root, work); await this.persist(root, work)
      })
      this.schedule(root)
    }))
  }

  async recover(): Promise<GitSyncResult[]> {
    await this.restore()
    return this.syncAll()
  }

  /** Read durable work without starting a Git operation. */
  async restore(): Promise<void> {
    const { readdir } = await import('fs/promises')
    const names = await readdir(this.options.statePath).catch(() => [] as string[])
    for (const name of names.filter(name => name.endsWith('.json'))) {
      const file = path.join(this.options.statePath, name)
      const id = name.slice(0, -5)
      const work = await readFile(file, 'utf8').then(value => decodePendingWork(JSON.parse(value), id)).catch(() => null)
      const root = work?.repository
      if (root && work) this.pending.set(root, work)
    }
  }

  async syncAll(): Promise<GitSyncResult[]> { return Promise.all([...this.pending.keys()].map(root => this.sync(root))) }
  stop(): void {
    this.stopped = true
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }
  async retryPush(repositoryId: string): Promise<GitSyncResult> {
    const work = await this.readById(repositoryId)
    if (!work?.repository) throw new Error('Unknown Git repository')
    const root = work.repository
    return this.lock(root, async () => {
      const pending = await this.read(root)
      if (!pending?.pushPending) throw new Error('Repository has no pending Git push')
      await pushRepository(root, this.options.remote, this.options.branch, this.options.commandTimeoutMs)
      pending.pushPending = false
      pending.lastError = null
      if (pending.paths.length) {
        this.pending.set(root, pending)
        await this.persist(root, pending)
        this.schedule(root)
      } else {
        this.pending.delete(root)
        await this.persist(root, null)
      }
      return { repository: root, committed: false, pushed: true, pendingPush: false, paths: [] }
    })
  }

  async listPending(): Promise<GitPendingStatus[]> {
    const { readdir } = await import('fs/promises')
    const names = await readdir(this.options.statePath).catch(() => [] as string[])
    return Promise.all(names.filter(name => name.endsWith('.json')).map(async name => {
      const id = name.slice(0, -5)
      const work = await readFile(path.join(this.options.statePath, name), 'utf8').then(value => decodePendingWork(JSON.parse(value), id)).catch(() => null)
      if (!work?.repository) return null
      const metadata = await inspectRepository(work.repository, this.options.remote, this.options.commandTimeoutMs).catch(() => ({ branch: null, remote: null }))
      return { id: name.slice(0, -5), branch: metadata.branch, remote: metadata.remote, pendingPathCount: work.paths.length, pendingPush: work.pushPending, lastError: work.lastError ?? null }
    })).then(values => values.filter((value): value is GitPendingStatus => value !== null))
  }

  private schedule(root: string): void {
    if (this.stopped) return
    const current = this.timers.get(root); if (current) clearTimeout(current)
    this.timers.set(root, setTimeout(() => {
      void this.sync(root).catch(() => undefined)
    }, this.debounceMs))
  }
  private stateFile(root: string): string { return path.join(this.options.statePath, `${createHash('sha256').update(root).digest('hex')}.json`) }
  private repositoryId(root: string): string { return createHash('sha256').update(root).digest('hex') }
  private lock<T>(root: string, callback: () => Promise<T>): Promise<T> {
    return withRepositoryLock(this.options.statePath, root, callback, this.options.lockTimeoutMs, this.options.staleLockMs)
  }
  // State filename hashes root; root is retained in JSON to avoid exposing server paths in filenames.
  private async read(root: string): Promise<PendingWork | null> {
    try { return decodePendingWork(JSON.parse(await readFile(this.stateFile(root), 'utf8')), this.repositoryId(root)) } catch { return null }
  }
  private async readById(id: string): Promise<PendingWork | null> {
    if (!/^[a-f0-9]{64}$/.test(id)) return null
    try { return decodePendingWork(JSON.parse(await readFile(path.join(this.options.statePath, `${id}.json`), 'utf8')), id) } catch { return null }
  }
  private async persist(root: string, work: PendingWork | null): Promise<void> {
    await mkdir(this.options.statePath, { recursive: true, mode: 0o700 }); await chmod(this.options.statePath, 0o700); const target = this.stateFile(root)
    if (!work) return unlink(target).catch(() => undefined)
    const temporary = `${target}.${process.pid}.tmp`; await writeFile(temporary, JSON.stringify({ ...work, repository: root }), { encoding: 'utf8', mode: 0o600 }); await rename(temporary, target); await chmod(target, 0o600)
  }
  private async recordFailure(root: string, error: unknown): Promise<void> {
    await this.lock(root, async () => {
      const work = await this.read(root) ?? this.pending.get(root)
      if (!work) return
      work.lastError = redactGitText(error instanceof Error ? `${error.message}\n${'details' in error ? String(error.details ?? '') : ''}` : String(error))
      this.pending.set(root, work)
      await this.persist(root, work)
    })
  }
  async sync(root: string): Promise<GitSyncResult> {
    const timer = this.timers.get(root); if (timer) { clearTimeout(timer); this.timers.delete(root) }
    return this.lock(root, async () => {
      const work = await this.read(root) ?? this.pending.get(root)
      if (!work) return { repository: root, committed: false, pushed: false, pendingPush: false, paths: [] }
      let commit: string | null = null
      if (work.paths.length) {
        const message = `${this.options.commitPrefix ?? '[Madori]'} ${work.messages[work.messages.length - 1]}`
        await stagePaths(root, work.paths, this.options.commandTimeoutMs)
        const [author, ...coAuthors] = work.authors.length ? work.authors : this.options.botAuthor ? [this.options.botAuthor] : []
        commit = await commitStaged(root, message, author, coAuthors, this.options.commandTimeoutMs, work.paths)
      }
      let pendingPush = work.pushPending
      let pushed = false
      if (this.options.push && (commit || pendingPush)) {
        try { await pushRepository(root, this.options.remote, this.options.branch, this.options.commandTimeoutMs); pendingPush = false; pushed = true }
        catch (error) {
          work.pushPending = true
          // Commit is durable. Clear its mutation payload so retry performs a push only;
          // later mutations can be queued independently without changing that commit.
          if (commit) { work.paths = []; work.messages = []; work.authors = [] }
          work.lastError = redactGitText(error instanceof Error ? `${error.message}\n${'details' in error ? String(error.details ?? '') : ''}` : String(error))
          await this.persist(root, work)
          throw error
        }
      }
      this.pending.delete(root); await this.persist(root, null)
      return { repository: root, committed: Boolean(commit), commit: commit ?? undefined, pushed, pendingPush: false, paths: work.paths }
    }).catch(async (error) => {
      await this.recordFailure(root, error)
      throw error
    })
  }
}
