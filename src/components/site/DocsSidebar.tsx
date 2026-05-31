'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface NavItem {
  label: string
  url?: string
}

export function DocsSidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname()

  return (
    <nav className="space-y-1">
      {items.map((item) => {
        const active = pathname === item.url
        return (
          <Link
            key={item.url}
            href={item.url ?? '#'}
            className={cn(
              'block rounded-md px-3 py-1.5 text-sm transition-colors cursor-pointer',
              active
                ? 'bg-muted font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
