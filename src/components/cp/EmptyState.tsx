import { type LucideIcon, Inbox } from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  children?: React.ReactNode
}

export function EmptyState({ icon: Icon = Inbox, title, description, children }: EmptyStateProps) {
  return (
    <div className="mt-8 flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
      <Icon className="size-8 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium text-muted-foreground">{title}</p>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      )}
      {children}
    </div>
  )
}
