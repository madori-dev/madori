'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Check,
  CircleAlert,
  Clock3,
  GitBranch,
  Loader2,
  RefreshCw,
  Server,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/cp/PageHeader'
import { CapabilityGate } from '@/components/cp/CapabilityGate'

type GitStatus = 'clean' | 'pending' | 'syncing' | 'pushed' | 'failed'

export interface GitRepositoryStatus {
  id: string
  label: string
  branch?: string
  remote?: string
  status: GitStatus
  counts?: { added?: number; modified?: number; deleted?: number }
  error?: string
  canSync?: boolean
  canRetry?: boolean
}

interface GitStatusResponse {
  data?: { repositories?: GitRepositoryStatus[] } | GitRepositoryStatus[]
  repositories?: GitRepositoryStatus[]
}

const statusCopy: Record<GitStatus, { label: string; icon: typeof Check; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  clean: { label: 'Clean', icon: Check, variant: 'outline' },
  pending: { label: 'Pending changes', icon: Clock3, variant: 'secondary' },
  syncing: { label: 'Syncing', icon: Loader2, variant: 'secondary' },
  pushed: { label: 'Pushed', icon: Check, variant: 'default' },
  failed: { label: 'Sync failed', icon: CircleAlert, variant: 'destructive' },
}

function repositoryList(payload: GitStatusResponse): GitRepositoryStatus[] {
  if (Array.isArray(payload.data)) return payload.data
  return payload.data?.repositories ?? payload.repositories ?? []
}

export default function GitPage() {
  const [repositories, setRepositories] = useState<GitRepositoryStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      setError(null)
      const response = await fetch('/api/git/status', { cache: 'no-store' })
      if (!response.ok) throw new Error(`Unable to load Git status (${response.status})`)
      setRepositories(repositoryList(await response.json() as GitStatusResponse))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load Git status')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => { void loadStatus() })
  }, [loadStatus])

  async function sync(repository: GitRepositoryStatus, retry = false) {
    setWorking(repository.id)
    try {
      const response = await fetch(retry ? '/api/git/retry' : '/api/git/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repository: repository.id }),
      })
      if (!response.ok) throw new Error(`Git ${retry ? 'retry' : 'sync'} failed (${response.status})`)
      toast.success(retry ? 'Git push retry started' : 'Git sync started', { description: repository.label })
      await loadStatus()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Git operation failed')
    } finally {
      setWorking(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Git" description="Monitor content synchronization across configured repositories." />

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div><p className="font-medium">Git status unavailable</p><p className="mt-1">{error}</p></div>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2" aria-label="Loading Git repositories">
          {[1, 2].map((item) => <Skeleton key={item} className="h-64 rounded-xl" />)}
        </div>
      ) : repositories.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <GitBranch className="size-8 text-muted-foreground" aria-hidden="true" />
            <div><p className="font-medium">No Git repositories configured</p><p className="mt-1 text-sm text-muted-foreground">Configure tracked content paths to see synchronization status here.</p></div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {repositories.map((repository) => {
            const state = statusCopy[repository.status] ?? statusCopy.clean
            const StateIcon = state.icon
            const busy = working === repository.id || repository.status === 'syncing'
            const changes = repository.counts ?? {}
            return (
              <Card key={repository.id} size="sm" className="min-w-0">
                <CardHeader className="border-b">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2 truncate"><Server className="size-4 text-muted-foreground" aria-hidden="true" />{repository.label}</CardTitle>
                      <CardDescription className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1"><span className="inline-flex items-center gap-1"><GitBranch className="size-3" aria-hidden="true" />{repository.branch ?? 'Default branch'}</span>{repository.remote && <><span aria-hidden="true">·</span><span className="truncate">{repository.remote}</span></>}</CardDescription>
                    </div>
                    <Badge variant={state.variant} className="shrink-0"><StateIcon className={repository.status === 'syncing' ? 'animate-spin' : undefined} aria-hidden="true" />{state.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-center text-xs">
                    <div><p className="text-lg font-semibold tabular-nums">{changes.added ?? 0}</p><p className="text-muted-foreground">Added</p></div>
                    <div><p className="text-lg font-semibold tabular-nums">{changes.modified ?? 0}</p><p className="text-muted-foreground">Modified</p></div>
                    <div><p className="text-lg font-semibold tabular-nums">{changes.deleted ?? 0}</p><p className="text-muted-foreground">Deleted</p></div>
                  </div>

                  {repository.error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{repository.error}</div>}
                  <div className="flex flex-wrap justify-end gap-2">
                    <CapabilityGate resource="git" action="edit">{(repository.status === 'failed' || repository.canRetry) && <Button variant="outline" size="sm" disabled={busy} onClick={() => void sync(repository, true)}><RefreshCw className="size-3.5" aria-hidden="true" />Retry push</Button>}<Button size="sm" disabled={busy || repository.canSync === false} onClick={() => void sync(repository)}>{busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <GitBranch aria-hidden="true" />}Sync now</Button></CapabilityGate>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
