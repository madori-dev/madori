'use client'

import { AlertTriangle, CheckCircle2, Loader2, X, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type { UploadFileProgress } from './use-asset-manager'

interface UploadProgressPanelProps {
  queue: UploadFileProgress[]
  onDismiss: (id: string) => void
  onClearAll: () => void
}

export function UploadProgressPanel({
  queue,
  onDismiss,
  onClearAll,
}: UploadProgressPanelProps) {
  if (queue.length === 0) return null

  const activeCount = queue.filter(
    (item) => item.status === 'pending' || item.status === 'uploading'
  ).length
  const successCount = queue.filter((item) => item.status === 'success').length
  const errorCount = queue.filter((item) => item.status === 'error').length
  const allDone = activeCount === 0

  return (
    <div className="border-t border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          {!allDone && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          <span className="text-sm font-medium text-foreground">
            {allDone
              ? `Upload complete`
              : `Uploading ${activeCount} file${activeCount !== 1 ? 's' : ''}…`}
          </span>
          {allDone && (
            <span className="text-xs text-muted-foreground">
              {successCount > 0 && `${successCount} succeeded`}
              {successCount > 0 && errorCount > 0 && ', '}
              {errorCount > 0 && `${errorCount} failed`}
            </span>
          )}
        </div>
        {allDone && (
          <Button variant="ghost" size="sm" onClick={onClearAll}>
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">Dismiss all</span>
          </Button>
        )}
      </div>

      {/* File list */}
      <div className="max-h-48 overflow-y-auto">
        {queue.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 px-4 py-2 border-b border-border last:border-0"
          >
            {/* Status icon */}
            <div className="shrink-0">
              {item.status === 'pending' && (
                <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
              )}
              {item.status === 'uploading' && (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              )}
              {item.status === 'success' && (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              )}
              {item.status === 'error' && (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
            </div>

            {/* Filename and progress */}
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate text-foreground">{item.filename}</p>
              {item.status === 'uploading' && (
                <Progress value={item.progress} className="mt-1" />
              )}
              {item.status === 'error' && item.error && (
                <p className="text-xs text-destructive mt-0.5" title={item.error}>
                  <span className="inline-flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span className="truncate">{item.error}</span>
                  </span>
                </p>
              )}
            </div>

            {/* Progress percentage / dismiss */}
            <div className="shrink-0">
              {item.status === 'uploading' && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {item.progress}%
                </span>
              )}
              {(item.status === 'success' || item.status === 'error') && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => onDismiss(item.id)}
                >
                  <X className="h-3 w-3" />
                  <span className="sr-only">Dismiss</span>
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
