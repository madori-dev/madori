'use client'

import { ChevronRight, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AssetBreadcrumbProps {
  currentDirectory: string
  onNavigate: (directory: string) => void
}

export function AssetBreadcrumb({ currentDirectory, onNavigate }: AssetBreadcrumbProps) {
  const segments = currentDirectory ? currentDirectory.split('/') : []

  return (
    <div className="flex items-center gap-1 border-b border-border px-4 py-2">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2"
        onClick={() => onNavigate('')}
      >
        <Home className="h-4 w-4" />
      </Button>

      {segments.map((segment, index) => {
        const path = segments.slice(0, index + 1).join('/')
        const isLast = index === segments.length - 1

        return (
          <div key={path} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <Button
              variant={isLast ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-sm"
              onClick={() => onNavigate(path)}
            >
              {segment}
            </Button>
          </div>
        )
      })}
    </div>
  )
}
