export interface GitAuthor {
  name: string
  email: string
}

export interface GitMutation {
  /** Absolute paths written or deleted by a completed content mutation. */
  paths: string[]
  author?: GitAuthor
  /** Human-readable description, e.g. "Updated blog/welcome". */
  message: string
  occurredAt?: string
}

export interface GitRepository {
  root: string
  branch: string | null
  remote: string | null
}

export type GitFileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'unknown'

export interface GitStatusEntry {
  path: string
  originalPath?: string
  index: string
  workingTree: string
  status: GitFileStatus
}

export interface GitSyncResult {
  repository: string
  committed: boolean
  commit?: string
  pushed: boolean
  pendingPush: boolean
  paths: string[]
}

export interface GitCoordinatorOptions {
  statePath: string
  debounceMs?: number
  lockTimeoutMs?: number
  staleLockMs?: number
  push?: boolean
  remote?: string
  branch?: string
  botAuthor?: GitAuthor
  commitPrefix?: string
  commandTimeoutMs?: number
}

/** API-safe pending work summary; never exposes filesystem paths. */
export interface GitPendingStatus {
  id: string
  branch: string | null
  remote: string | null
  pendingPathCount: number
  pendingPush: boolean
  lastError: string | null
}

/** Deliberately small response contract for Control Panel and API clients. */
export interface GitRepositoryStatus {
  id: string
  label: string
  branch: string | null
  remote: string | null
  status: 'clean' | 'pending' | 'syncing' | 'pushed' | 'failed'
  counts: { added: number; modified: number; deleted: number }
  error: string | null
  canSync: boolean
  canRetry: boolean
}
