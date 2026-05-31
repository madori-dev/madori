'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  label: string
  url?: string
}

export function DocsMobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const current = items.find((item) => item.url === pathname)

  return (
    <div className="md:hidden mb-6">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground cursor-pointer"
      >
        <span>{current?.label ?? 'Documentation'}</span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <nav className="mt-2 rounded-md border border-border bg-background p-2 space-y-0.5">
          {items.map((item) => {
            const active = pathname === item.url
            return (
              <Link
                key={item.url}
                href={item.url ?? '#'}
                onClick={() => setOpen(false)}
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
      )}
    </div>
  )
}
