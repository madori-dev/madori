'use client'

import { AlertTriangle } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface SpendLimitIndicatorProps {
  currentTotal: number
  limit?: number
  allowed: boolean
}

function getProgressColor(percentage: number): string {
  if (percentage >= 90) return 'bg-red-500'
  if (percentage >= 75) return 'bg-yellow-500'
  return 'bg-green-500'
}

function getProgressTrackColor(percentage: number): string {
  if (percentage >= 90) return 'bg-red-100 dark:bg-red-950'
  if (percentage >= 75) return 'bg-yellow-100 dark:bg-yellow-950'
  return 'bg-green-100 dark:bg-green-950'
}

export function SpendLimitIndicator({ currentTotal, limit, allowed }: SpendLimitIndicatorProps) {
  if (limit == null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Spend Limit</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No spend limit configured</p>
        </CardContent>
      </Card>
    )
  }

  const percentage = Math.min((currentTotal / limit) * 100, 100)
  const progressColor = getProgressColor(percentage)
  const trackColor = getProgressTrackColor(percentage)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Spend Limit</CardTitle>
          {!allowed && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="size-3" />
              Limit reached
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          className={cn('h-2 w-full rounded-full overflow-hidden', trackColor)}
          role="progressbar"
          aria-valuenow={currentTotal}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-label={`Token usage: ${currentTotal} of ${limit}`}
        >
          <div
            className={cn('h-full rounded-full transition-all', progressColor)}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {currentTotal.toLocaleString()} / {limit.toLocaleString()} tokens
        </p>
      </CardContent>
    </Card>
  )
}
