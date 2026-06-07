import { Bot, Globe, Cpu, KeyRound } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface ProviderCardProps {
  provider: string
  baseUrl: string
  model: string
  apiKey: string
}

const providerLabels: Record<string, string> = {
  anthropic: 'Anthropic',
  'openai-compatible': 'OpenAI-compatible',
}

export function ProviderCard({ provider, baseUrl, model, apiKey }: ProviderCardProps) {
  const label = providerLabels[provider] ?? provider

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="size-4 text-muted-foreground" />
          AI Provider
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Provider</dt>
            <dd>
              <Badge variant="secondary">{label}</Badge>
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <Globe className="size-3.5" />
              Base URL
            </dt>
            <dd className="max-w-[60%] truncate font-mono text-xs">{baseUrl}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <Cpu className="size-3.5" />
              Model
            </dt>
            <dd className="font-mono text-xs">{model}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <KeyRound className="size-3.5" />
              API Key
            </dt>
            <dd className="font-mono text-xs">{apiKey}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}
