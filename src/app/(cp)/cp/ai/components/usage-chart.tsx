'use client'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface UsageDataItem {
  key: string
  totalInputTokens: number
  totalOutputTokens: number
  requestCount: number
}

interface UsageChartProps {
  data: UsageDataItem[]
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`
  return count.toString()
}

function formatOperationLabel(key: string): string {
  return key
    .replace(/\./g, ' › ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function UsageChart({ data }: UsageChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Token Usage</CardTitle>
          <CardDescription>Aggregated usage by operation type</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-4 text-center">
            No usage data yet
          </p>
        </CardContent>
      </Card>
    )
  }

  const maxTokens = Math.max(
    ...data.map((d) => d.totalInputTokens + d.totalOutputTokens)
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Token Usage</CardTitle>
        <CardDescription>Aggregated usage by operation type</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_80px_80px_60px] gap-2 text-xs font-medium text-muted-foreground pb-1 border-b">
            <span>Operation</span>
            <span className="text-right">Input</span>
            <span className="text-right">Output</span>
            <span className="text-right">Reqs</span>
          </div>

          {/* Data rows */}
          {data.map((item) => {
            const total = item.totalInputTokens + item.totalOutputTokens
            const inputPct = maxTokens > 0 ? (item.totalInputTokens / maxTokens) * 100 : 0
            const outputPct = maxTokens > 0 ? (item.totalOutputTokens / maxTokens) * 100 : 0

            return (
              <div key={item.key} className="space-y-1.5">
                <div className="grid grid-cols-[1fr_80px_80px_60px] gap-2 items-center text-sm">
                  <span className="font-medium truncate">
                    {formatOperationLabel(item.key)}
                  </span>
                  <span className="text-right text-muted-foreground tabular-nums">
                    {formatTokenCount(item.totalInputTokens)}
                  </span>
                  <span className="text-right text-muted-foreground tabular-nums">
                    {formatTokenCount(item.totalOutputTokens)}
                  </span>
                  <span className="text-right text-muted-foreground tabular-nums">
                    {item.requestCount}
                  </span>
                </div>

                {/* Bar chart visualization */}
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="bg-primary/70 transition-all"
                    style={{ width: `${inputPct}%` }}
                    title={`Input: ${item.totalInputTokens.toLocaleString()} tokens`}
                  />
                  <div
                    className="bg-primary transition-all"
                    style={{ width: `${outputPct}%` }}
                    title={`Output: ${item.totalOutputTokens.toLocaleString()} tokens`}
                  />
                </div>
              </div>
            )
          })}

          {/* Legend */}
          <div className="flex items-center gap-4 pt-2 border-t text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="size-2.5 rounded-sm bg-primary/70" />
              <span>Input tokens</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="size-2.5 rounded-sm bg-primary" />
              <span>Output tokens</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
