import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PageHeaderProps {
  title: string
  description?: string
  createHref?: string
  createLabel?: string
}

export function PageHeader({ title, description, createHref, createLabel = 'Create new' }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {createHref && (
        <Button nativeButton={false} render={<Link href={createHref} />}>
          <Plus className="size-4" />
          {createLabel}
        </Button>
      )}
    </div>
  )
}
