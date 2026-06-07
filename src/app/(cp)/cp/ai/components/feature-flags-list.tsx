'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export interface FeatureFlagsProps {
  features: {
    editor: boolean
    seo: boolean
    altText: boolean
    blueprints: boolean
    autoFill: boolean
    taxonomy: boolean
    bulk: boolean
  }
}

const featureLabels: Record<keyof FeatureFlagsProps['features'], string> = {
  editor: 'Editor AI',
  seo: 'SEO Generation',
  altText: 'Alt Text',
  blueprints: 'Blueprints',
  autoFill: 'Auto-Fill',
  taxonomy: 'Taxonomy Suggestions',
  bulk: 'Bulk Operations',
}

export function FeatureFlagsList({ features }: FeatureFlagsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Feature Flags</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3" role="list">
          {(Object.entries(featureLabels) as [keyof FeatureFlagsProps['features'], string][]).map(
            ([key, label]) => {
              const enabled = features[key]
              return (
                <li key={key} className="flex items-center justify-between">
                  <span className="text-sm font-medium">{label}</span>
                  <Badge
                    className={
                      enabled
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                    }
                  >
                    {enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </li>
              )
            }
          )}
        </ul>
      </CardContent>
    </Card>
  )
}
