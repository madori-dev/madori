'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NavigationItem } from '@/lib/types'

export function DocsSidebar({ items }: { items: NavigationItem[] }) {
  const pathname = usePathname()

  return (
    <nav className="space-y-0.5">
      {items.map((item, i) => (
        <SidebarItem key={i} item={item} pathname={pathname} depth={0} />
      ))}
    </nav>
  )
}

function SidebarItem({ item, pathname, depth }: { item: NavigationItem; pathname: string; depth: number }) {
  const label = item.label as string | undefined
  const url = item.url as string | undefined
  const icon = item.icon as string | undefined
  const hasChildren = Array.isArray(item.children) && item.children.length > 0
  const active = pathname === url
  const childActive = hasChildren && isChildActive(item.children!, pathname)

  const [expanded, setExpanded] = useState(active || childActive)

  if (hasChildren) {
    return (
      <div>
        <div className="flex items-center">
          {url ? (
            <Link
              href={url}
              className={cn(
                'flex-1 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors cursor-pointer',
                active
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
              style={{ paddingLeft: `${depth * 12 + 12}px` }}
            >
              {icon && <span className="text-xs" aria-hidden="true">{icon}</span>}
              {label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className={cn(
                'flex-1 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-left transition-colors cursor-pointer',
                childActive
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
              style={{ paddingLeft: `${depth * 12 + 12}px` }}
            >
              {icon && <span className="text-xs" aria-hidden="true">{icon}</span>}
              {label}
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />
          </button>
        </div>
        {expanded && (
          <div className="mt-0.5">
            {item.children!.map((child, i) => (
              <SidebarItem key={i} item={child} pathname={pathname} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <Link
      href={url ?? '#'}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors cursor-pointer',
        active
          ? 'bg-muted font-medium text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
      )}
      style={{ paddingLeft: `${depth * 12 + 12}px` }}
    >
      {icon && <span className="text-xs" aria-hidden="true">{icon}</span>}
      {label}
    </Link>
  )
}

/** Check if any child item's url matches the current pathname */
function isChildActive(children: NavigationItem[], pathname: string): boolean {
  for (const child of children) {
    if ((child.url as string) === pathname) return true
    if (child.children && isChildActive(child.children, pathname)) return true
  }
  return false
}
