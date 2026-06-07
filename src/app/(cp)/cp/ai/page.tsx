'use client'

import { useEffect, useState } from 'react'
import { Bot, Server, Activity, Gauge, ToggleLeft } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/cp/PageHeader'

interface AiConfigData {
  provider: string
  baseUrl: string
  model: string
  apiKey: string
  features: Record<string, boolean>
  spendLimit: { maxTokens: number; period: string } | null
}

interface AggregatedUsage {
  key: string
  totalInputTokens: number
  totalOutputTokens: number
  requestCount: number
}

interface LimitStatus {
  allowed: boolean
  currentTotal: number
  limit?: number
}

interface UsageData {
  data: AggregatedUsage[]
  limit: LimitStatus
}

export default function AiSettingsPage() {
  const [config, setConfig] = useState<AiConfigData | null>(null)
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notConfigured, setNotConfigured] = useState(false)

  useEffect(() => {
    async function fetchData() {
      try {
        const [configRes, usageRes] = await Promise.all([
          fetch('/api/ai/config'),
          fetch('/api/ai/usage?groupBy=operation'),
        ])

        if (configRes.status === 404) {
          setNotConfigured(true)
          return
        }

        if (configRes.ok) {
          const configJson = await configRes.json()
          setConfig(configJson)
        }

        if (usageRes.ok) {
          const usageJson = await usageRes.json()
          setUsage(usageJson)
        }
      } catch {
        setNotConfigured(true)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="AI" description="Manage AI provider, usage, and feature settings" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (notConfigured) {
    return (
      <div className="space-y-6">
        <PageHeader title="AI" description="Manage AI provider, usage, and feature settings" />
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Bot className="size-12 text-muted-foreground/50" />
            <h2 className="mt-4 text-lg font-semibold">AI not configured</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Add an <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">ai</code> block
              to your <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">madori.config.ts</code> to
              enable AI features.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const totalTokens = usage?.data.reduce(
    (acc, item) => acc + item.totalInputTokens + item.totalOutputTokens,
    0
  ) ?? 0

  const totalRequests = usage?.data.reduce(
    (acc, item) => acc + item.requestCount,
    0
  ) ?? 0

  return (
    <div className="space-y-6">
      <PageHeader title="AI" description="Manage AI provider, usage, and feature settings" />

      <div className="grid gap-4 md:grid-cols-2">
        {/* Provider Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="size-4" />
              Provider
            </CardTitle>
            <CardDescription>Active AI provider configuration</CardDescription>
          </CardHeader>
          <CardContent>
            {config ? (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Provider</dt>
                  <dd className="font-medium">{config.provider}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Model</dt>
                  <dd className="font-mono text-xs">{config.model}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Base URL</dt>
                  <dd className="max-w-[200px] truncate font-mono text-xs">{config.baseUrl}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">API Key</dt>
                  <dd className="font-mono text-xs">{config.apiKey}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No configuration available.</p>
            )}
          </CardContent>
        </Card>

        {/* Usage Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-4" />
              Usage
            </CardTitle>
            <CardDescription>Token usage by operation</CardDescription>
          </CardHeader>
          <CardContent>
            {usage && usage.data.length > 0 ? (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total tokens</span>
                  <span className="font-medium">{totalTokens.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total requests</span>
                  <span className="font-medium">{totalRequests.toLocaleString()}</span>
                </div>
                <div className="mt-3 space-y-1.5">
                  {usage.data.map((item) => (
                    <div key={item.key} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{item.key}</span>
                      <span className="font-mono">
                        {(item.totalInputTokens + item.totalOutputTokens).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No usage data yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Spend Limit */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="size-4" />
              Spend Limit
            </CardTitle>
            <CardDescription>Token budget and current usage</CardDescription>
          </CardHeader>
          <CardContent>
            {config?.spendLimit ? (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Period</span>
                  <span className="font-medium capitalize">{config.spendLimit.period}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Limit</span>
                  <span className="font-medium">{config.spendLimit.maxTokens.toLocaleString()} tokens</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Current</span>
                  <span className="font-medium">{(usage?.limit.currentTotal ?? 0).toLocaleString()} tokens</span>
                </div>
                {usage?.limit && (
                  <div className="mt-2">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full transition-all ${
                          usage.limit.allowed ? 'bg-primary' : 'bg-destructive'
                        }`}
                        style={{
                          width: `${Math.min(
                            100,
                            (usage.limit.currentTotal / (usage.limit.limit ?? 1)) * 100
                          )}%`,
                        }}
                      />
                    </div>
                    {!usage.limit.allowed && (
                      <p className="mt-1.5 text-xs text-destructive">Spend limit reached</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No spend limit configured.</p>
            )}
          </CardContent>
        </Card>

        {/* Feature Flags */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ToggleLeft className="size-4" />
              Features
            </CardTitle>
            <CardDescription>Enabled AI capabilities</CardDescription>
          </CardHeader>
          <CardContent>
            {config?.features ? (
              <div className="flex flex-wrap gap-2">
                {Object.entries(config.features).map(([feature, enabled]) => (
                  <Badge
                    key={feature}
                    variant={enabled ? 'default' : 'secondary'}
                    className={!enabled ? 'opacity-50' : ''}
                  >
                    {feature}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No feature configuration available.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
