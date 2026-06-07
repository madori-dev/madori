'use client'

import { useState, useCallback, useRef } from 'react'
import { Loader2, Play, AlertTriangle, CheckCircle2, XCircle, Layers } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress'

/**
 * Bulk operations UI component.
 *
 * Provides a form for selecting an AI operation and scope, then streams
 * SSE progress events from POST /api/ai/bulk and displays real-time
 * progress including a progress bar, current entry, error count, and
 * halt state when spend limit is reached.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4
 */

interface BulkOperationsProps {
  collections: Array<{ handle: string; title: string }>
  entries: Array<{ id: string; collection: string; content: string }>
}

type OperationType = 'generate-meta-descriptions'

type RunStatus = 'idle' | 'running' | 'complete' | 'halted' | 'error'

interface ProgressState {
  completed: number
  total: number
  current?: string
  errors: number
  status: RunStatus
  errorMessage?: string
}

const OPERATIONS: Array<{ value: OperationType; label: string }> = [
  { value: 'generate-meta-descriptions', label: 'Generate meta descriptions' },
]

export function BulkOperations({ collections, entries }: BulkOperationsProps) {
  const [operation, setOperation] = useState<OperationType>('generate-meta-descriptions')
  const [scope, setScope] = useState<string>('all')
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const scopedEntries = scope === 'all'
    ? entries
    : entries.filter((e) => e.collection === scope)

  const canStart = scopedEntries.length > 0 && progress?.status !== 'running'

  const startBulk = useCallback(async () => {
    if (!canStart) return

    const controller = new AbortController()
    abortRef.current = controller

    setProgress({
      completed: 0,
      total: scopedEntries.length,
      errors: 0,
      status: 'running',
    })

    try {
      const res = await fetch('/api/ai/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation, entries: scopedEntries }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setProgress((prev) => prev ? {
          ...prev,
          status: 'error',
          errorMessage: data?.error ?? `Request failed (${res.status})`,
        } : null)
        return
      }

      if (!res.body) {
        setProgress((prev) => prev ? {
          ...prev,
          status: 'error',
          errorMessage: 'No response stream received',
        } : null)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse SSE events from buffer
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue

          try {
            const event = JSON.parse(line.slice(6))
            handleProgressEvent(event)
          } catch {
            // Skip malformed events
          }
        }
      }

      // Process any remaining buffer
      if (buffer.startsWith('data: ')) {
        try {
          const event = JSON.parse(buffer.slice(6))
          handleProgressEvent(event)
        } catch {
          // Skip malformed events
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setProgress((prev) => prev ? {
        ...prev,
        status: 'error',
        errorMessage: 'Network error. Please try again.',
      } : null)
    }
  }, [canStart, operation, scopedEntries])

  const handleProgressEvent = useCallback((event: {
    type: string
    completed: number
    total: number
    current?: string
    errors: number
    error?: string
    status?: string
  }) => {
    switch (event.type) {
      case 'progress':
        setProgress({
          completed: event.completed,
          total: event.total,
          current: event.current,
          errors: event.errors,
          status: 'running',
        })
        break
      case 'complete':
        setProgress({
          completed: event.completed,
          total: event.total,
          errors: event.errors,
          status: 'complete',
        })
        break
      case 'halted':
        setProgress({
          completed: event.completed,
          total: event.total,
          current: event.current,
          errors: event.errors,
          status: 'halted',
        })
        break
      case 'error':
        setProgress({
          completed: event.completed,
          total: event.total,
          current: event.current,
          errors: event.errors,
          status: 'running',
          errorMessage: event.error,
        })
        break
    }
  }, [])

  const reset = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setProgress(null)
  }, [])

  const percentComplete = progress
    ? Math.round((progress.completed / Math.max(progress.total, 1)) * 100)
    : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="size-4 text-muted-foreground" />
          Bulk Operations
        </CardTitle>
        <CardDescription>
          Run AI operations across multiple entries at once.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Operation selector */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Operation</label>
          <Select
            value={operation}
            onValueChange={(val) => setOperation(val as OperationType)}
            disabled={progress?.status === 'running'}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPERATIONS.map((op) => (
                <SelectItem key={op.value} value={op.value}>
                  {op.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Scope selector */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Scope</label>
          <Select
            value={scope}
            onValueChange={(val) => setScope(val ?? 'all')}
            disabled={progress?.status === 'running'}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All collections</SelectItem>
              {collections.map((col) => (
                <SelectItem key={col.handle} value={col.handle}>
                  {col.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {scopedEntries.length} {scopedEntries.length === 1 ? 'entry' : 'entries'} in scope
          </p>
        </div>

        {/* Start / Reset button */}
        <div className="flex items-center gap-2">
          {(!progress || progress.status === 'idle') && (
            <Button
              onClick={startBulk}
              disabled={!canStart}
              className="cursor-pointer"
            >
              <Play className="size-3.5" data-icon="inline-start" />
              Start
            </Button>
          )}
          {progress?.status === 'running' && (
            <Button variant="outline" onClick={reset} className="cursor-pointer">
              Cancel
            </Button>
          )}
          {(progress?.status === 'complete' || progress?.status === 'halted' || progress?.status === 'error') && (
            <Button variant="outline" onClick={reset} className="cursor-pointer">
              Reset
            </Button>
          )}
        </div>

        {/* Progress display */}
        {progress && (
          <div className="space-y-3 rounded-md border border-border p-3">
            {/* Progress bar */}
            <Progress value={percentComplete}>
              <ProgressLabel>Progress</ProgressLabel>
              <ProgressValue>
                {() => `${progress.completed}/${progress.total}`}
              </ProgressValue>
            </Progress>

            {/* Current entry */}
            {progress.status === 'running' && progress.current && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                <span className="truncate">
                  Processing: <span className="font-mono text-xs">{progress.current}</span>
                </span>
              </div>
            )}

            {/* Error count */}
            {progress.errors > 0 && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <XCircle className="size-3.5" />
                {progress.errors} {progress.errors === 1 ? 'error' : 'errors'} encountered
              </div>
            )}

            {/* Halted state (spend limit reached) */}
            {progress.status === 'halted' && (
              <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-4 shrink-0" />
                <span>Operation halted — spend limit reached. {progress.completed} of {progress.total} entries processed.</span>
              </div>
            )}

            {/* Error state */}
            {progress.status === 'error' && progress.errorMessage && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-sm text-destructive">
                <XCircle className="size-4 shrink-0" />
                <span>{progress.errorMessage}</span>
              </div>
            )}

            {/* Completion summary */}
            {progress.status === 'complete' && (
              <div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 p-2.5 text-sm text-green-700 dark:text-green-400">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>
                  Complete — {progress.completed} {progress.completed === 1 ? 'entry' : 'entries'} processed
                  {progress.errors > 0 && `, ${progress.errors} ${progress.errors === 1 ? 'error' : 'errors'}`}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
