import { Skeleton } from '@/components/ui/skeleton'

interface ListSkeletonProps {
  rows?: number
}

export function ListSkeleton({ rows = 3 }: ListSkeletonProps) {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}
